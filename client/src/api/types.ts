export interface User {
  id: number;
  username: string;
  role: 'owner' | 'worker';
}

export type RecommendationStatus =
  | 'pending'
  | 'approved'
  | 'dismissed'
  | 'completed'
  | 'resolved';

export interface ReorderRecommendation {
  avgDailyUsage: number;
  daysRemaining: number;
  reorderNeeded: boolean;
  recommendedQty: number;
  isOverstock: boolean;
  // workflow fields (optional for backwards compatibility with cached rows)
  status?: RecommendationStatus;
  reason?: string | null;
}

/** Owner-facing DTO returned by /api/reorders endpoints. */
export interface ReorderRecommendationDTO {
  id: number;
  inventoryItemId: number;
  ingredientName: string;
  unit: string;
  currentQuantity: number;
  reorderThreshold: number;
  safetyStock: number;
  avgDailyUsage: number;
  daysRemaining: number;
  recommendedQty: number;
  reorderNeeded: boolean;
  isOverstock: boolean;
  status: RecommendationStatus;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  dismissedAt: string | null;
  completedAt: string | null;
  approvedBy: { id: number; username: string } | null;
  dismissedBy: { id: number; username: string } | null;
  completedBy: { id: number; username: string } | null;
}

export interface ReorderRunCheckSummary {
  itemsChecked: number;
  newPending: string[];
  resolved: string[];
  stillPending: string[];
}

export interface InventoryItem {
  id: number;
  name: string;
  currentQuantity: number;
  reorderThreshold: number;
  safetyStock: number;
  unit: string;
  updatedAt: string;
  reorderRecommendations: ReorderRecommendation[];
}

export interface RecipeIngredient {
  id: number;
  quantity: number;
  inventoryItem: { id: number; name: string; unit: string };
}

export interface Recipe {
  id: number;
  drinkName: string;
  ingredients: RecipeIngredient[];
}

export interface DailySalesItem {
  id: number;
  quantity: number;
  recipe: Recipe;
}

export interface DailySales {
  id: number;
  date: string;
  submittedBy: { username: string };
  items: DailySalesItem[];
}

export interface InventoryAdjustment {
  id: number;
  delta: number;
  reason: string;
  type: 'manual' | 'waste' | 'sale';
  createdAt: string;
  inventoryItem: { name: string; unit: string };
  adjustedBy: { username: string };
}

export interface AnalyticsOverview {
  inventory: InventoryItem[];
  recentAdjustments: InventoryAdjustment[];
}

export interface SalesTrends {
  byDrink: Record<string, number>;
  byDay: Record<string, Record<string, number>>;
}

export interface AuditLog {
  id: number;
  action: string;
  details: string | null;
  createdAt: string;
  user: { username: string; role: string };
}
