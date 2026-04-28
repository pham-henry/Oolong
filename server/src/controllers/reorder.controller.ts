/**
 * Reorder controller — thin wrappers over reorder.service.
 *
 * Auth + RBAC: every route in this file is mounted under
 *   `router.use(authenticate, authorize('owner'))` (see routes/reorder.ts),
 * so workers cannot reach any endpoint here.
 *
 * Audit logging: each Owner action writes a single AuditLog entry.
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as reorderService from '../services/reorder.service';
import { RecommendationError } from '../services/reorder.service';
import { createAuditLog } from '../services/audit.service';

// ---------- Helpers --------------------------------------------------------

function parseId(req: Request, res: Response): number | null {
  const id = parseInt(req.params['id'] as string, 10);
  if (Number.isNaN(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid recommendation id' });
    return null;
  }
  return id;
}

function handleRecommendationError(err: unknown, res: Response, next: NextFunction) {
  if (err instanceof RecommendationError) {
    if (err.code === 'NOT_FOUND') {
      res.status(404).json({ error: err.message });
      return true;
    }
    if (err.code === 'INVALID_STATE') {
      res.status(409).json({ error: err.message });
      return true;
    }
  }
  next(err);
  return true;
}

// ---------- GET /api/reorders ---------------------------------------------

export async function listAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const recommendations = await reorderService.getAllRecommendations();
    res.json(recommendations);
  } catch (err) {
    next(err);
  }
}

// ---------- GET /api/reorders/pending -------------------------------------

export async function listPending(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const recommendations = await reorderService.getPendingRecommendations();
    res.json(recommendations);
  } catch (err) {
    next(err);
  }
}

// ---------- POST /api/reorders/run-check ----------------------------------
// Demo / on-demand trigger. Recomputes all recommendations and returns the
// summary so the dashboard can show "X new pending, Y resolved".

export async function runCheck(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const summary = await reorderService.runReorderCheck(req.user!.userId);
    await createAuditLog(
      req.user!.userId,
      'REORDER_RUN_CHECK',
      `Manual run-check by Owner. New pending: ${summary.newPending.length}, resolved: ${summary.resolved.length}`
    );
    res.json(summary);
  } catch (err) {
    next(err);
  }
}

// ---------- PATCH /api/reorders/:id/approve -------------------------------

const idOnlyParams = z.object({ id: z.number().int().positive() });

export async function approve(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = parseId(req, res);
  if (id === null) return;

  try {
    idOnlyParams.parse({ id }); // belt-and-suspenders
    const rec = await reorderService.approveRecommendation(id, req.user!.userId);
    await createAuditLog(
      req.user!.userId,
      'REORDER_APPROVE',
      `Approved reorder #${rec.id} for ${rec.ingredientName} (~${rec.recommendedQty.toFixed(0)} ${rec.unit})`
    );
    res.json(rec);
  } catch (err) {
    handleRecommendationError(err, res, next);
  }
}

// ---------- PATCH /api/reorders/:id/dismiss -------------------------------

export async function dismiss(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = parseId(req, res);
  if (id === null) return;

  try {
    const rec = await reorderService.dismissRecommendation(id, req.user!.userId);
    await createAuditLog(
      req.user!.userId,
      'REORDER_DISMISS',
      `Dismissed reorder #${rec.id} for ${rec.ingredientName}`
    );
    res.json(rec);
  } catch (err) {
    handleRecommendationError(err, res, next);
  }
}

// ---------- PATCH /api/reorders/:id/complete ------------------------------

export async function complete(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = parseId(req, res);
  if (id === null) return;

  try {
    const rec = await reorderService.completeRecommendation(id, req.user!.userId);
    await createAuditLog(
      req.user!.userId,
      'REORDER_COMPLETE',
      `Marked reorder #${rec.id} for ${rec.ingredientName} as completed`
    );
    res.json(rec);
  } catch (err) {
    handleRecommendationError(err, res, next);
  }
}
