import api from './client';
import { AuditLog } from './types';

export async function getAuditLogs(limit = 100): Promise<AuditLog[]> {
  const res = await api.get(`/audit?limit=${limit}`);
  return res.data;
}
