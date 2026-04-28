import { AdjustmentType } from '@prisma/client';
import { prisma } from '../lib/prisma';

export async function getAllInventory() {
  return prisma.inventoryItem.findMany({
    orderBy: { name: 'asc' },
    include: {
      reorderRecommendations: true,
    },
  });
}

export async function adjustInventory(
  inventoryItemId: number,
  userId: number,
  delta: number,
  reason: string,
  type: AdjustmentType
) {
  const [updatedItem, adjustment] = await prisma.$transaction([
    prisma.inventoryItem.update({
      where: { id: inventoryItemId },
      data: { currentQuantity: { increment: delta } },
    }),
    prisma.inventoryAdjustment.create({
      data: { inventoryItemId, userId, delta, reason, type },
    }),
  ]);

  return { item: updatedItem, adjustment };
}

export async function updateThresholds(
  inventoryItemId: number,
  reorderThreshold: number,
  safetyStock: number
) {
  return prisma.inventoryItem.update({
    where: { id: inventoryItemId },
    data: { reorderThreshold, safetyStock },
  });
}

export async function getInventoryItem(id: number) {
  return prisma.inventoryItem.findUnique({ where: { id } });
}
