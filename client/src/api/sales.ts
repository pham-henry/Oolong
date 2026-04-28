import api from './client';
import { Recipe, DailySales } from './types';

export async function getRecipes(): Promise<Recipe[]> {
  const res = await api.get('/sales/recipes');
  return res.data;
}

export async function submitSales(items: { recipeId: number; quantity: number }[]): Promise<DailySales> {
  const res = await api.post('/sales', { items });
  return res.data;
}

export async function getRecentSales(): Promise<DailySales[]> {
  const res = await api.get('/sales');
  return res.data;
}
