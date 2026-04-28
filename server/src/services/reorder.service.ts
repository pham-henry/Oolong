/**
 * Reorder / Inventory Monitoring service
 *
 * Owns the lifecycle of `ReorderRecommendation` rows:
 *   - generation     — runReorderCheck() recomputes stock health and creates,
 *                      updates, or auto-resolves recommendations per item.
 *   - querying       — list-all and list-pending for the Owner dashboard and
 *                      Smart Assistant context.
 *   - workflow       — Owner approve / dismiss / complete actions.
 *
 * Design notes:
 *   - One recommendation row per inventory item (enforced by `@unique
 *     inventoryItemId` in schema). This naturally prevents duplicate pending
 *     recommendations for the same ingredient.
 *   - Calculation logic mirrors the existing analytics formulas (recipe-based
 *     7-day usage → avg daily → days remaining → recommended qty). Kept simple,
 *     deterministic, and explainable. No ML.
 *   - All Owner actions are audit-logged from the caller (controller). The
 *     service itself audit-logs autonomous events (auto-generated /
 *     auto-resolved batches) using a synthetic `userId` argument supplied by
 *     the caller (so manual `run-check` is logged under the Owner who clicked,
 *     scheduled runs under a system user id passed in).
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { createAuditLog } from './audit.service';

// --------------------------------------------------------------------------
// Local DTO types (compatible with the regenerated Prisma client)
// --------------------------------------------------------------------------

export type RecommendationStatus =
  | 'pending'
  | 'approved'
  | 'dismissed'
  | 'completed'
  | 'resolved';

export interface RecommendationDTO {
  id: number;
  inventoryItemId: number;
  ingredientName: string;
  unit: string;
  currentQuantity: number;
  reorderThreshold: number;
  safetyStock: number;
  avgDailyUsage: number;
  daysRemaining: number;
  recommendedQty: number;
  reorderNeeded: boolean;
  isOverstock: boolean;
  status: RecommendationStatus;
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
  approvedAt: Date | null;
  dismissedAt: Date | null;
  completedAt: Date | null;
  approvedBy: { id: number; username: string } | null;
  dismissedBy: { id: number; username: string } | null;
  completedBy: { id: number; username: string } | null;
}

export class RecommendationError extends Error {
  public readonly code: 'NOT_FOUND' | 'INVALID_STATE';
  constructor(code: RecommendationError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

// --------------------------------------------------------------------------
// Calculation helpers (kept pure / deterministic)
// --------------------------------------------------------------------------

interface ComputedHealth {
  avgDailyUsage: number;
  daysRemaining: number;
  reorderNeeded: boolean;
  recommendedQty: number;
  isOverstock: boolean;
  reason: string;
}

function computeItemHealth(
  currentQuantity: number,
  reorderThreshold: number,
  safetyStock: number,
  totalUsage7Days: number
): ComputedHealth {
  const avgDailyUsage = totalUsage7Days / 7;
  const daysRemaining =
    avgDailyUsage > 0 ? currentQuantity / avgDailyUsage : 999;
  const buffer = reorderThreshold + safetyStock;

  // Reorder is needed if we're at/below the threshold + safety stock,
  // OR if usage projections show we'll run out within a week.
  const belowBuffer = currentQuantity <= buffer;
  const lowProjection = avgDailyUsage > 0 && daysRemaining < 7;
  const reorderNeeded = belowBuffer || lowProjection;

  // Order enough to cover ~14 days of expected usage plus the buffer,
  // minus what we already have. Floor at 0.
  const recommendedQty =
    avgDailyUsage > 0
      ? Math.max(0, avgDailyUsage * 14 - currentQuantity + buffer)
      : 0;

  const isOverstock = avgDailyUsage > 0 && daysRemaining > 30;

  // Build a readable reason so the Owner / Assistant can explain "why".
  const reasonParts: string[] = [];
  if (belowBuffer) {
    reasonParts.push(
      `current stock ${currentQuantity} ≤ threshold ${reorderThreshold} + safety ${safetyStock}`
    );
  }
  if (lowProjection) {
    reasonParts.push(
      `~${daysRemaining.toFixed(1)} days remaining at ${avgDailyUsage.toFixed(1)}/day`
    );
  }
  if (!reorderNeeded && isOverstock) {
    reasonParts.push(
      `overstock — ${daysRemaining.toFixed(1)} days remaining at ${avgDailyUsage.toFixed(1)}/day`
    );
  }
  const reason =
    reasonParts.length > 0
      ? reasonParts.join('; ')
      : `stock healthy at ${currentQuantity} (buffer ${buffer})`;

  return {
    avgDailyUsage,
    daysRemaining,
    reorderNeeded,
    recommendedQty,
    isOverstock,
    reason,
  };
}

// --------------------------------------------------------------------------
// Core: runReorderCheck
// --------------------------------------------------------------------------

export interface RunCheckSummary {
  itemsChecked: number;
  newPending: string[]; // ingredient names that just became pending
  resolved: string[];   // ingredient names whose pending recs auto-resolved
  stillPending: string[];
}

/**
 * Recalculates stock health for every inventory item and reconciles
 * `ReorderRecommendation` rows.
 *
 * Status transitions performed automatically here:
 *   - reorderNeeded === true:
 *       • no row, or row in [resolved, dismissed, completed]  →  status = pending
 *         (a fresh wave of need re-opens a recommendation)
 *       • row in [pending, approved]                          →  keep status,
 *         refresh metrics + reason + snapshot
 *   - reorderNeeded === false:
 *       • row in [pending]  →  status = resolved (stock recovered)
 *       • row in [approved] →  keep approved (Owner already acted, awaiting
 *                              completion / delivery)
 *       • row in [dismissed, completed, resolved] or absent → keep / create
 *                              with status = resolved
 *
 * This guarantees: at most one row per ingredient, no duplicate pending
 * recommendations, and stale pending alerts auto-clear.
 *
 * @param triggeredByUserId  user id to attribute the audit log to (the Owner
 *                           who clicked run-check, the scheduler's system id,
 *                           or the Worker who submitted sales).
 */
export async function runReorderCheck(
  triggeredByUserId: number
): Promise<RunCheckSummary> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [items, salesItems] = await Promise.all([
    prisma.inventoryItem.findMany({
      include: { reorderRecommendations: true },
    }),
    prisma.dailySalesItem.findMany({
      where: { dailySales: { date: { gte: sevenDaysAgo } } },
      include: { recipe: { include: { ingredients: true } } },
    }),
  ]);

  // Sum total usage per inventory item across the 7-day window.
  const usageMap = new Map<number, number>();
  for (const si of salesItems) {
    for (const ing of si.recipe.ingredients) {
      usageMap.set(
        ing.inventoryItemId,
        (usageMap.get(ing.inventoryItemId) ?? 0) + ing.quantity * si.quantity
      );
    }
  }

  const summary: RunCheckSummary = {
    itemsChecked: items.length,
    newPending: [],
    resolved: [],
    stillPending: [],
  };

  // Process items sequentially to keep audit-log ordering deterministic.
  for (const item of items) {
    const health = computeItemHealth(
      item.currentQuantity,
      item.reorderThreshold,
      item.safetyStock,
      usageMap.get(item.id) ?? 0
    );

    const existing = item.reorderRecommendations[0] as
      | (typeof item.reorderRecommendations[0] & {
          status?: RecommendationStatus;
        })
      | undefined;
    const existingStatus = (existing?.status ?? null) as RecommendationStatus | null;

    let newStatus: RecommendationStatus;
    if (health.reorderNeeded) {
      const reopen =
        !existingStatus ||
        existingStatus === 'resolved' ||
        existingStatus === 'dismissed' ||
        existingStatus === 'completed';
      newStatus = reopen ? 'pending' : existingStatus!;
    } else {
      if (existingStatus === 'pending') newStatus = 'resolved';
      else if (existingStatus === 'approved') newStatus = 'approved';
      else newStatus = 'resolved';
    }

    // Track high-level transitions for the audit log + return summary.
    if (newStatus === 'pending' && existingStatus !== 'pending') {
      summary.newPending.push(item.name);
    } else if (newStatus === 'pending') {
      summary.stillPending.push(item.name);
    } else if (newStatus === 'resolved' && existingStatus === 'pending') {
      summary.resolved.push(item.name);
    }

    // Common payload fields. Cast keeps the call site clean against the
    // current generated types (regenerated types pick these up automatically).
    const dataPayload = {
      avgDailyUsage: health.avgDailyUsage,
      daysRemaining: health.daysRemaining,
      reorderNeeded: health.reorderNeeded,
      recommendedQty: health.recommendedQty,
      isOverstock: health.isOverstock,
      status: newStatus,
      reason: health.reason,
      currentQtySnapshot: item.currentQuantity,
      reorderThresholdSnapshot: item.reorderThreshold,
      safetyStockSnapshot: item.safetyStock,
    } as unknown as Prisma.ReorderRecommendationUpdateInput;

    await prisma.reorderRecommendation.upsert({
      where: { inventoryItemId: item.id },
      update: dataPayload,
      create: {
        inventoryItemId: item.id,
        ...(dataPayload as object),
      } as unknown as Prisma.ReorderRecommendationCreateInput,
    });
  }

  // One concise audit-log entry per check, not one per item.
  if (
    summary.newPending.length > 0 ||
    summary.resolved.length > 0
  ) {
    await createAuditLog(
      triggeredByUserId,
      'REORDER_CHECK',
      [
        summary.newPending.length > 0 &&
          `New pending: ${summary.newPending.join(', ')}`,
        summary.resolved.length > 0 &&
          `Auto-resolved: ${summary.resolved.join(', ')}`,
      ]
        .filter(Boolean)
        .join(' | ')
    );
  }

  return summary;
}

// --------------------------------------------------------------------------
// Querying
// --------------------------------------------------------------------------

/**
 * Shared mapping helper — flattens a Prisma row + joined inventoryItem +
 * joined user records into the controller-facing DTO.
 */
function toDTO(row: any): RecommendationDTO {
  return {
    id: row.id,
    inventoryItemId: row.inventoryItemId,
    ingredientName: row.inventoryItem.name,
    unit: row.inventoryItem.unit,
    currentQuantity: row.inventoryItem.currentQuantity,
    reorderThreshold: row.inventoryItem.reorderThreshold,
    safetyStock: row.inventoryItem.safetyStock,
    avgDailyUsage: row.avgDailyUsage,
    daysRemaining: row.daysRemaining,
    recommendedQty: row.recommendedQty,
    reorderNeeded: row.reorderNeeded,
    isOverstock: row.isOverstock,
    status: (row.status ?? 'pending') as RecommendationStatus,
    reason: row.reason ?? null,
    createdAt: row.createdAt ?? row.updatedAt,
    updatedAt: row.updatedAt,
    approvedAt: row.approvedAt ?? null,
    dismissedAt: row.dismissedAt ?? null,
    completedAt: row.completedAt ?? null,
    approvedBy: row.approvedBy
      ? { id: row.approvedBy.id, username: row.approvedBy.username }
      : null,
    dismissedBy: row.dismissedBy
      ? { id: row.dismissedBy.id, username: row.dismissedBy.username }
      : null,
    completedBy: row.completedBy
      ? { id: row.completedBy.id, username: row.completedBy.username }
      : null,
  };
}

const RECOMMENDATION_INCLUDE = {
  inventoryItem: true,
  approvedBy: { select: { id: true, username: true } },
  dismissedBy: { select: { id: true, username: true } },
  completedBy: { select: { id: true, username: true } },
} as unknown as Prisma.ReorderRecommendationInclude;

export async function getAllRecommendations(): Promise<RecommendationDTO[]> {
  const rows = await prisma.reorderRecommendation.findMany({
    include: RECOMMENDATION_INCLUDE,
    orderBy: { updatedAt: 'desc' },
  });
  return rows.map(toDTO);
}

export async function getPendingRecommendations(): Promise<RecommendationDTO[]> {
  const rows = await prisma.reorderRecommendation.findMany({
    where: { status: 'pending' } as unknown as Prisma.ReorderRecommendationWhereInput,
    include: RECOMMENDATION_INCLUDE,
    orderBy: { updatedAt: 'desc' },
  });
  return rows.map(toDTO);
}

/**
 * Returns recommendations that an LLM context block should mention:
 *   - all currently pending
 *   - approved within the last 14 days (Owner has acted but order still in flight)
 */
export async function getAssistantRelevantRecommendations(): Promise<{
  pending: RecommendationDTO[];
  recentlyApproved: RecommendationDTO[];
}> {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const [pendingRows, approvedRows] = await Promise.all([
    prisma.reorderRecommendation.findMany({
      where: { status: 'pending' } as unknown as Prisma.ReorderRecommendationWhereInput,
      include: RECOMMENDATION_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.reorderRecommendation.findMany({
      where: {
        status: 'approved',
        approvedAt: { gte: fourteenDaysAgo },
      } as unknown as Prisma.ReorderRecommendationWhereInput,
      include: RECOMMENDATION_INCLUDE,
      orderBy: { approvedAt: 'desc' } as unknown as Prisma.ReorderRecommendationOrderByWithRelationInput,
    }),
  ]);

  return {
    pending: pendingRows.map(toDTO),
    recentlyApproved: approvedRows.map(toDTO),
  };
}

// --------------------------------------------------------------------------
// Owner workflow actions (approve / dismiss / complete)
// --------------------------------------------------------------------------

async function getRecommendationOrThrow(id: number) {
  const row = await prisma.reorderRecommendation.findUnique({
    where: { id },
    include: RECOMMENDATION_INCLUDE,
  });
  if (!row) {
    throw new RecommendationError('NOT_FOUND', `Recommendation ${id} not found`);
  }
  return row as any;
}

function assertStatusIn(
  current: RecommendationStatus,
  allowed: RecommendationStatus[]
) {
  if (!allowed.includes(current)) {
    throw new RecommendationError(
      'INVALID_STATE',
      `Cannot perform action while recommendation is in '${current}' state. Allowed: ${allowed.join(', ')}`
    );
  }
}

export async function approveRecommendation(
  id: number,
  ownerId: number
): Promise<RecommendationDTO> {
  const row = await getRecommendationOrThrow(id);
  assertStatusIn(row.status as RecommendationStatus, ['pending']);

  const updated = await prisma.reorderRecommendation.update({
    where: { id },
    data: {
      status: 'approved',
      approvedById: ownerId,
      approvedAt: new Date(),
    } as unknown as Prisma.ReorderRecommendationUpdateInput,
    include: RECOMMENDATION_INCLUDE,
  });
  return toDTO(updated);
}

export async function dismissRecommendation(
  id: number,
  ownerId: number
): Promise<RecommendationDTO> {
  const row = await getRecommendationOrThrow(id);
  assertStatusIn(row.status as RecommendationStatus, ['pending', 'approved']);

  const updated = await prisma.reorderRecommendation.update({
    where: { id },
    data: {
      status: 'dismissed',
      dismissedById: ownerId,
      dismissedAt: new Date(),
    } as unknown as Prisma.ReorderRecommendationUpdateInput,
    include: RECOMMENDATION_INCLUDE,
  });
  return toDTO(updated);
}

export async function completeRecommendation(
  id: number,
  ownerId: number
): Promise<RecommendationDTO> {
  const row = await getRecommendationOrThrow(id);
  assertStatusIn(row.status as RecommendationStatus, ['pending', 'approved']);

  const updated = await prisma.reorderRecommendation.update({
    where: { id },
    data: {
      status: 'completed',
      completedById: ownerId,
      completedAt: new Date(),
    } as unknown as Prisma.ReorderRecommendationUpdateInput,
    include: RECOMMENDATION_INCLUDE,
  });
  return toDTO(updated);
}
