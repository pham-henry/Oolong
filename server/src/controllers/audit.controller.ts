import { Request, Response, NextFunction } from 'express';
import { getAuditLogs } from '../services/audit.service';

export async function getLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) || '100', 10), 500);
    const logs = await getAuditLogs(limit);
    res.json(logs);
  } catch (err) {
    next(err);
  }
}
