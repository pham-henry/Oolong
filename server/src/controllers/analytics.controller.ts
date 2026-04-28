import { Request, Response, NextFunction } from 'express';
import * as analyticsService from '../services/analytics.service';

export async function getOverview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await analyticsService.getAnalyticsOverview();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getSalesTrends(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await analyticsService.getSalesTrends();
    res.json(data);
  } catch (err) {
    next(err);
  }
}
