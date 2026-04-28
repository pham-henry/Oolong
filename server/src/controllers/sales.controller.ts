import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as salesService from '../services/sales.service';
import { runReorderCheck } from '../services/reorder.service';
import { createAuditLog } from '../services/audit.service';

const salesSchema = z.object({
  items: z
    .array(z.object({ recipeId: z.number().int().positive(), quantity: z.number().int().min(0) }))
    .min(1),
});

export async function submitSales(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { items } = salesSchema.parse(req.body);
    const nonZeroItems = items.filter((i) => i.quantity > 0);
    if (nonZeroItems.length === 0) {
      res.status(400).json({ error: 'At least one drink quantity must be greater than 0' });
      return;
    }

    const sale = await salesService.submitDailySales(req.user!.userId, nonZeroItems);
    // Re-evaluate inventory health after the sale so reorder recommendations
    // reflect the post-deduction stock levels.
    await runReorderCheck(req.user!.userId);

    const summary = nonZeroItems.map((i) => `recipeId=${i.recipeId}:${i.quantity}`).join(', ');
    await createAuditLog(req.user!.userId, 'SALES_SUBMISSION', `Daily sales submitted: ${summary}`);

    res.status(201).json(sale);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    next(err);
  }
}

export async function getRecipes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const recipes = await salesService.getAllRecipes();
    res.json(recipes);
  } catch (err) {
    next(err);
  }
}

export async function getRecentSales(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sales = await salesService.getRecentSales(7);
    res.json(sales);
  } catch (err) {
    next(err);
  }
}
