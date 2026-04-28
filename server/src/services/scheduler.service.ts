/**
 * Scheduled inventory monitoring.
 *
 * Optional layer on top of reorder.service. Reads two environment variables:
 *   ENABLE_SCHEDULED_REORDER_CHECK = "true" | "false"  (default: false)
 *   REORDER_CHECK_CRON             = cron expression  (default: "0 8 * * *",
 *                                    i.e. 08:00 every day)
 *
 * If `node-cron` is installed, the cron expression is used. If it isn't,
 * we fall back to a simple `setInterval` (`REORDER_CHECK_INTERVAL_HOURS`,
 * default 24h) so the scheduler still does something useful out of the box.
 *
 * If scheduling is disabled the function is a no-op and the server starts
 * normally — the manual `POST /api/reorders/run-check` endpoint still works.
 */

import { runReorderCheck } from './reorder.service';
import { prisma } from '../lib/prisma';

let started = false;

/**
 * Resolve a stable user id to attribute scheduled runs to. Falls back to the
 * first owner user; only used if the env var SCHEDULER_USER_ID isn't set.
 */
async function resolveSchedulerUserId(): Promise<number | null> {
  const fromEnv = Number(process.env.SCHEDULER_USER_ID);
  if (Number.isInteger(fromEnv) && fromEnv > 0) return fromEnv;

  const owner = await prisma.user.findFirst({
    where: { role: 'owner' },
    orderBy: { id: 'asc' },
    select: { id: true },
  });
  return owner?.id ?? null;
}

async function runOnce(userId: number) {
  try {
    const summary = await runReorderCheck(userId);
    console.log(
      `[scheduler] reorder check: checked=${summary.itemsChecked}, ` +
        `newPending=${summary.newPending.length}, resolved=${summary.resolved.length}`
    );
  } catch (err) {
    console.error('[scheduler] reorder check failed:', (err as Error).message);
  }
}

export async function startReorderScheduler(): Promise<void> {
  if (started) return;
  if (process.env.ENABLE_SCHEDULED_REORDER_CHECK !== 'true') {
    console.log('[scheduler] Scheduled reorder check disabled (set ENABLE_SCHEDULED_REORDER_CHECK=true to enable)');
    return;
  }

  const userId = await resolveSchedulerUserId();
  if (userId === null) {
    console.warn('[scheduler] No owner user found — scheduler will not start. Seed the DB first.');
    return;
  }

  const cronExpr = process.env.REORDER_CHECK_CRON ?? '0 8 * * *';

  // Try node-cron first (real cron expressions). Fall back gracefully if the
  // package isn't installed or the expression is invalid. The module name is
  // built at runtime so TypeScript doesn't try to resolve it at compile time
  // when node-cron isn't installed.
  try {
    const cronModuleName = 'node-cron';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await (Function('m', 'return import(m)') as (m: string) => Promise<any>)(
      cronModuleName
    ).catch(() => null);
    if (mod && typeof mod.schedule === 'function') {
      mod.schedule(cronExpr, () => { void runOnce(userId); });
      started = true;
      console.log(`[scheduler] Reorder check scheduled with cron "${cronExpr}"`);
      return;
    }
  } catch (err) {
    console.warn('[scheduler] node-cron unavailable, falling back to setInterval:', (err as Error).message);
  }

  // Fallback: setInterval every N hours (default 24).
  const hours = Number(process.env.REORDER_CHECK_INTERVAL_HOURS ?? 24);
  const ms = Math.max(1, hours) * 60 * 60 * 1000;
  setInterval(() => { void runOnce(userId); }, ms);
  started = true;
  console.log(`[scheduler] node-cron not installed — using setInterval every ${hours}h`);
}
