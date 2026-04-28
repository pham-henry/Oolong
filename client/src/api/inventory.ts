import api from './client';
import { InventoryItem } from './types';

export async function getInventory(): Promise<InventoryItem[]> {
  const res = await api.get('/inventory');
  return res.data;
}

export async function adjustInventory(
  id: number,
  delta: number,
  reason: string,
  type: 'manual' | 'waste'
): Promise<{ item: InventoryItem }> {
  const res = await api.put(`/inventory/${id}/adjust`, { delta, reason, type });
  return res.data;
}

export async function updateThresholds(
  id: number,
  reorderThreshold: number,
  safetyStock: number
): Promise<InventoryItem> {
  const res = await api.put(`/inventory/${id}/thresholds`, { reorderThreshold, safetyStock });
  return res.data;
}
