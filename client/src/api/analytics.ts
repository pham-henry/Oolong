import api from './client';
import { AnalyticsOverview, SalesTrends } from './types';

export async function getAnalyticsOverview(): Promise<AnalyticsOverview> {
  const res = await api.get('/analytics/overview');
  return res.data;
}

export async function getSalesTrends(): Promise<SalesTrends> {
  const res = await api.get('/analytics/sales-trends');
  return res.data;
}
