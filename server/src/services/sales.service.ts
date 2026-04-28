import { prisma } from '../lib/prisma';

interface SalesItem {
  recipeId: number;
  quantity: number;
}

export async function submitDailySales(userId: number, items: SalesItem[]) {
  return prisma.$transaction(async (tx) => {
    const dailySales = await tx.dailySales.create({
      data: {
        userId,
        items: {
          create: items.map((i) => ({ recipeId: i.recipeId, quantity: i.quantity })),
        },
      },
      include: { items: true },
    });

    // Deduct ingredients for each drink sold
    for (const item of items) {
      if (item.quantity === 0) continue;

      const recipe = await tx.recipe.findUnique({
        where: { id: item.recipeId },
        include: { ingredients: true },
      });
      if (!recipe) throw new Error(`Recipe ${item.recipeId} not found`);

      for (const ingredient of recipe.ingredients) {
        const deduction = ingredient.quantity * item.quantity;
        await tx.inventoryItem.update({
          where: { id: ingredient.inventoryItemId },
          data: { currentQuantity: { decrement: deduction } },
        });
      }
    }

    return dailySales;
  });
}

export async function getRecentSales(days = 7) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  return prisma.dailySales.findMany({
    where: { date: { gte: since } },
    orderBy: { date: 'desc' },
    include: {
      items: { include: { recipe: true } },
      submittedBy: { select: { username: true } },
    },
  });
}

export async function getAllRecipes() {
  return prisma.recipe.findMany({
    include: {
      ingredients: { include: { inventoryItem: true } },
    },
    orderBy: { drinkName: 'asc' },
  });
}
