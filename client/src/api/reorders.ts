import api from './client';
import { ReorderRecommendationDTO, ReorderRunCheckSummary } from './types';

export async function listReorders(): Promise<ReorderRecommendationDTO[]> {
  const res = await api.get('/reorders');
  return res.data;
}

export async function listPendingReorders(): Promise<ReorderRecommendationDTO[]> {
  const res = await api.get('/reorders/pending');
  return res.data;
}

export async function runReorderCheck(): Promise<ReorderRunCheckSummary> {
  const res = await api.post('/reorders/run-check');
  return res.data;
}

export async function approveReorder(id: number): Promise<ReorderRecommendationDTO> {
  const res = await api.patch(`/reorders/${id}/approve`);
  return res.data;
}

export async function dismissReorder(id: number): Promise<ReorderRecommendationDTO> {
  const res = await api.patch(`/reorders/${id}/dismiss`);
  return res.data;
}

export async function completeReorder(id: number): Promise<ReorderRecommendationDTO> {
  const res = await api.patch(`/reorders/${id}/complete`);
  return res.data;
}
