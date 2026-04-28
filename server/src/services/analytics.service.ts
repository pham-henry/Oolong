import { prisma } from '../lib/prisma';
import { runReorderCheck } from './reorder.service';

/**
 * Legacy entry point. The full reorder lifecycle (status transitions,
 * audit logging, snapshots) now lives in reorder.service.runReorderCheck.
 * Kept as a thin shim so any existing caller still works; the caller's
 * userId must be passed in so the audit log is properly attributed.
 *
 * @deprecated Call `runReorderCheck(userId)` from reorder.service directly.
 */
export async function refreshRecommendations(triggeredByUserId: number) {
  return runReorderCheck(triggeredByUserId);
}

export async function getAnalyticsOverview() {
  const [inventory, adjustments] = await Promise.all([
    prisma.inventoryItem.findMany({
      orderBy: { name: 'asc' },
      include: { reorderRecommendations: true },
    }),
    prisma.inventoryAdjustment.findMany({
      where: {
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        type: { in: ['waste', 'manual'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        inventoryItem: { select: { name: true, unit: true } },
        adjustedBy: { select: { username: true } },
      },
    }),
  ]);

  return { inventory, recentAdjustments: adjustments };
}

export async function getSalesTrends() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const salesItems = await prisma.dailySalesItem.findMany({
    where: { dailySales: { date: { gte: sevenDaysAgo } } },
    include: {
      recipe: true,
      dailySales: { select: { date: true } },
    },
  });

  // Aggregate by drink
  const byDrink: Record<string, number> = {};
  for (const si of salesItems) {
    const name = si.recipe.drinkName;
    byDrink[name] = (byDrink[name] ?? 0) + si.quantity;
  }

  // Aggregate by day
  const byDay: Record<string, Record<string, number>> = {};
  for (const si of salesItems) {
    const day = si.dailySales.date.toISOString().slice(0, 10);
    if (!byDay[day]) byDay[day] = {};
    const name = si.recipe.drinkName;
    byDay[day][name] = (byDay[day][name] ?? 0) + si.quantity;
  }

  return { byDrink, byDay };
}
