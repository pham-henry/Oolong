import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AdjustmentType } from '@prisma/client';
import * as inventoryService from '../services/inventory.service';
import { createAuditLog } from '../services/audit.service';
import { runReorderCheck } from '../services/reorder.service';

const adjustSchema = z.object({
  delta: z.number().refine((n) => n !== 0, 'Delta cannot be zero'),
  reason: z.string().min(1, 'Reason is required'),
  type: z.enum(['manual', 'waste']),
});

const thresholdSchema = z.object({
  reorderThreshold: z.number().min(0),
  safetyStock: z.number().min(0),
});

export async function getInventory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const items = await inventoryService.getAllInventory();
    res.json(items);
  } catch (err) {
    next(err);
  }
}

export async function adjustInventory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseInt(req.params['id'] as string, 10);
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid item id' }); return; }

    const { delta, reason, type } = adjustSchema.parse(req.body);
    const result = await inventoryService.adjustInventory(id, req.user!.userId, delta, reason, type as AdjustmentType);

    const actionLabel = type === 'waste' ? 'WASTE_ADJUSTMENT' : 'INVENTORY_EDIT';
    await createAuditLog(
      req.user!.userId,
      actionLabel,
      `${type === 'waste' ? 'Waste' : 'Manual'} adjustment on item ${id}: delta=${delta}, reason="${reason}"`
    );

    // Inventory just changed — recompute reorder recommendations.
    await runReorderCheck(req.user!.userId);

    res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    next(err);
  }
}

export async function updateThresholds(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseInt(req.params['id'] as string, 10);
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid item id' }); return; }

    const { reorderThreshold, safetyStock } = thresholdSchema.parse(req.body);
    const item = await inventoryService.updateThresholds(id, reorderThreshold, safetyStock);

    await createAuditLog(
      req.user!.userId,
      'THRESHOLD_UPDATE',
      `Updated thresholds for item ${id}: threshold=${reorderThreshold}, safety=${safetyStock}`
    );

    // Threshold change shifts the reorder calculus — recompute.
    await runReorderCheck(req.user!.userId);

    res.json(item);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    next(err);
  }
}
