import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DRINKS = ['Matcha Latte', 'Jasmine Milk Tea', 'Mango Fruit Tea', 'Vietnamese Coffee', 'Oolong Milk Tea'];

// Deliberately positioned quantities to tell a clear demo story:
//   tapioca pearls → CRITICAL  (<1 day remaining)
//   matcha powder  → LOW       (~3.6 days remaining)
//   jasmine tea    → LOW       (reorder already approved — order in transit)
//   mango syrup    → OVERSTOCK (dismissed recommendation)
//   coffee         → OK        (completed reorder — just restocked)
//   everything else → healthy
const INGREDIENTS = [
  { name: 'matcha powder',  currentQuantity: 18,  reorderThreshold: 20,  safetyStock: 8,  unit: 'bags'    },
  { name: 'jasmine tea',    currentQuantity: 25,  reorderThreshold: 20,  safetyStock: 8,  unit: 'bags'    },
  { name: 'oolong tea',     currentQuantity: 50,  reorderThreshold: 15,  safetyStock: 5,  unit: 'bags'    },
  { name: 'mango syrup',    currentQuantity: 130, reorderThreshold: 15,  safetyStock: 5,  unit: 'bottles' },
  { name: 'coffee',         currentQuantity: 40,  reorderThreshold: 15,  safetyStock: 5,  unit: 'bags'    },
  { name: 'milk',           currentQuantity: 120, reorderThreshold: 15,  safetyStock: 5,  unit: 'gallons' },
  { name: 'condensed milk', currentQuantity: 35,  reorderThreshold: 15,  safetyStock: 5,  unit: 'cans'    },
  { name: 'tapioca pearls', currentQuantity: 6,   reorderThreshold: 20,  safetyStock: 10, unit: 'bags'    },
  { name: 'sugar syrup',    currentQuantity: 75,  reorderThreshold: 10,  safetyStock: 5,  unit: 'bottles' },
];

const RECIPES: Record<string, Record<string, number>> = {
  'Matcha Latte':      { 'matcha powder': 1, milk: 1 },
  'Jasmine Milk Tea':  { 'jasmine tea': 1, milk: 1, 'sugar syrup': 1, 'tapioca pearls': 1 },
  'Mango Fruit Tea':   { 'mango syrup': 1, 'sugar syrup': 1 },
  'Vietnamese Coffee': { coffee: 1, 'condensed milk': 1 },
  'Oolong Milk Tea':   { 'oolong tea': 1, milk: 1, 'tapioca pearls': 1 },
};

// Sales volumes [Matcha, Jasmine, Mango, VietCoffee, Oolong] for a given day offset.
// Jasmine Milk Tea trends up week over week — making it the chart story.
// Weekends run at 1.8× to create visible spikes.
function getDailySales(dayOffset: number): number[] {
  const d = new Date();
  d.setDate(d.getDate() - dayOffset);
  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
  const wm = isWeekend ? 1.8 : 1.0;

  let jasmineBase: number;
  if (dayOffset > 21)      jasmineBase = 4; // 4 weeks ago
  else if (dayOffset > 14) jasmineBase = 5; // 3 weeks ago
  else if (dayOffset > 7)  jasmineBase = 6; // 2 weeks ago
  else                     jasmineBase = 8; // last week (drives reorder calc)

  return [
    Math.round(5 * wm),             // Matcha Latte
    Math.round(jasmineBase * wm),   // Jasmine Milk Tea (trending)
    Math.round(2 * wm),             // Mango Fruit Tea  (low → overstock story)
    Math.round(4 * wm),             // Vietnamese Coffee
    Math.round(4 * wm),             // Oolong Milk Tea
  ];
}

function dateAt(daysBack: number, hour = 20): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  d.setHours(hour, 0, 0, 0);
  return d;
}

async function main() {
  console.log('Seeding database for VP demo...');

  // Full teardown in FK-safe order
  await prisma.auditLog.deleteMany();
  await prisma.reorderRecommendation.deleteMany();
  await prisma.inventoryAdjustment.deleteMany();
  await prisma.dailySalesItem.deleteMany();
  await prisma.dailySales.deleteMany();
  await prisma.recipeIngredient.deleteMany();
  await prisma.recipe.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.user.deleteMany();
  console.log('Cleared existing data');

  // ── Users ──────────────────────────────────────────────────────────────────
  const [owner, worker] = await Promise.all([
    prisma.user.create({
      data: { username: 'owner', passwordHash: await bcrypt.hash('owner123', 10), role: 'owner' },
    }),
    prisma.user.create({
      data: { username: 'worker', passwordHash: await bcrypt.hash('worker123', 10), role: 'worker' },
    }),
  ]);
  console.log('Created users');

  // ── Inventory ──────────────────────────────────────────────────────────────
  const inventoryMap: Record<string, number> = {};
  for (const ing of INGREDIENTS) {
    const item = await prisma.inventoryItem.create({ data: ing });
    inventoryMap[item.name] = item.id;
  }
  console.log('Created inventory items');

  // ── Recipes ────────────────────────────────────────────────────────────────
  const recipeMap: Record<string, number> = {};
  for (const drinkName of DRINKS) {
    const recipe = await prisma.recipe.create({
      data: {
        drinkName,
        ingredients: {
          create: Object.entries(RECIPES[drinkName]).map(([ingName, qty]) => ({
            inventoryItemId: inventoryMap[ingName],
            quantity: qty,
          })),
        },
      },
    });
    recipeMap[recipe.drinkName] = recipe.id;
  }
  console.log('Created recipes');

  // ── 30 Days of Sales ───────────────────────────────────────────────────────
  type AuditEntry = { userId: number; action: string; details: string; createdAt: Date };
  const salesAuditEntries: AuditEntry[] = [];

  for (let dayOffset = 30; dayOffset >= 1; dayOffset--) {
    const date = dateAt(dayOffset);
    const qtys = getDailySales(dayOffset);
    const items = DRINKS.map((drink, i) => ({
      recipeId: recipeMap[drink],
      quantity: qtys[i],
    })).filter(i => i.quantity > 0);

    await prisma.dailySales.create({
      data: { date, userId: worker.id, items: { create: items } },
    });

    const total = qtys.reduce((a, b) => a + b, 0);
    salesAuditEntries.push({
      userId: worker.id,
      action: 'SALES_SUBMISSION',
      details: `Daily sales submitted: ${total} cups across ${items.length} drinks`,
      createdAt: new Date(date.getTime() + 60_000),
    });
  }
  console.log('Created 30 days of sales');

  // ── Inventory Adjustments ──────────────────────────────────────────────────
  const adjustmentDefs = [
    { itemName: 'sugar syrup',    delta: -5,  reason: 'Contaminated container — discarded per protocol',        type: 'waste'  as const, daysBack: 8, hour: 16 },
    { itemName: 'matcha powder',  delta: 30,  reason: 'Emergency restock delivered from backup supplier',       type: 'manual' as const, daysBack: 6, hour: 11 },
    { itemName: 'milk',           delta: -8,  reason: 'Batch expired before opening — discarded',               type: 'waste'  as const, daysBack: 4, hour: 9  },
    { itemName: 'coffee',         delta: 50,  reason: 'Weekly delivery received from supplier',                 type: 'manual' as const, daysBack: 3, hour: 10 },
    { itemName: 'tapioca pearls', delta: -12, reason: 'Overcooked batch discarded before service',              type: 'waste'  as const, daysBack: 2, hour: 14 },
  ];

  const adjustmentAuditEntries: AuditEntry[] = [];
  for (const adj of adjustmentDefs) {
    const createdAt = dateAt(adj.daysBack, adj.hour);
    await prisma.inventoryAdjustment.create({
      data: {
        inventoryItemId: inventoryMap[adj.itemName],
        userId: worker.id,
        delta: adj.delta,
        reason: adj.reason,
        type: adj.type,
        createdAt,
      },
    });
    const unit = INGREDIENTS.find(i => i.name === adj.itemName)?.unit ?? 'units';
    adjustmentAuditEntries.push({
      userId: worker.id,
      action: adj.type === 'waste' ? 'WASTE_ADJUSTMENT' : 'INVENTORY_EDIT',
      details: `${adj.type === 'waste' ? 'Waste logged' : 'Manual adjustment'} for ${adj.itemName}: ${adj.delta > 0 ? '+' : ''}${adj.delta} ${unit}. Reason: ${adj.reason}`,
      createdAt,
    });
  }
  console.log('Created inventory adjustments');

  // ── Reorder Recommendations ────────────────────────────────────────────────
  // Compute based on last 7 days of sales (same logic as reorder.service.ts).
  // After compute, patch 3 records to their pre-staged lifecycle states.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const allItems = await prisma.inventoryItem.findMany();

  const salesItems = await prisma.dailySalesItem.findMany({
    where: { dailySales: { date: { gte: sevenDaysAgo } } },
    include: { recipe: { include: { ingredients: true } } },
  });

  const usageMap: Record<number, number> = {};
  for (const si of salesItems) {
    for (const ing of si.recipe.ingredients) {
      usageMap[ing.inventoryItemId] = (usageMap[ing.inventoryItemId] ?? 0) + ing.quantity * si.quantity;
    }
  }

  for (const item of allItems) {
    const totalUsage = usageMap[item.id] ?? 0;
    const avgDailyUsage = totalUsage / 7;
    const daysRemaining = avgDailyUsage > 0 ? item.currentQuantity / avgDailyUsage : 999;
    const reorderNeeded =
      item.currentQuantity <= item.reorderThreshold + item.safetyStock ||
      (avgDailyUsage > 0 && daysRemaining < 7);
    const recommendedQty =
      avgDailyUsage > 0
        ? Math.max(0, avgDailyUsage * 14 - item.currentQuantity + item.reorderThreshold + item.safetyStock)
        : 0;
    const isOverstock = avgDailyUsage > 0 && daysRemaining > 30;

    let reason: string;
    if (isOverstock) {
      reason = `Current stock lasts ~${Math.round(daysRemaining)} days at current usage. Consider reducing next order.`;
    } else if (reorderNeeded && daysRemaining < 2) {
      reason = `CRITICAL: Only ~${daysRemaining.toFixed(1)} days of stock at ${avgDailyUsage.toFixed(1)} ${item.unit}/day usage rate.`;
    } else if (reorderNeeded) {
      reason = `Stock below safety threshold. ~${daysRemaining.toFixed(1)} days remaining at ${avgDailyUsage.toFixed(1)} ${item.unit}/day.`;
    } else {
      reason = `Stock healthy. ~${Math.round(daysRemaining)} days remaining at current usage rate.`;
    }

    await prisma.reorderRecommendation.create({
      data: {
        inventoryItemId: item.id,
        avgDailyUsage,
        daysRemaining,
        reorderNeeded,
        recommendedQty,
        isOverstock,
        reason,
        currentQtySnapshot: item.currentQuantity,
        reorderThresholdSnapshot: item.reorderThreshold,
        safetyStockSnapshot: item.safetyStock,
        status: 'pending',
      },
    });
  }

  // Pre-stage full lifecycle: approved, completed, dismissed
  await prisma.reorderRecommendation.update({
    where: { inventoryItemId: inventoryMap['jasmine tea'] },
    data: {
      status: 'approved',
      approvedById: owner.id,
      approvedAt: dateAt(5, 14),
      reason: 'Stock below safety threshold. ~3.1 days remaining at 8.0 bags/day. Order placed — delivery expected within 7 days.',
    },
  });

  await prisma.reorderRecommendation.update({
    where: { inventoryItemId: inventoryMap['coffee'] },
    data: {
      status: 'completed',
      approvedById: owner.id,
      approvedAt: dateAt(10, 14),
      completedById: owner.id,
      completedAt: dateAt(3, 10),
      reason: 'Stock below safety threshold. Reorder approved and 50 bags received — stock fully restored.',
    },
  });

  await prisma.reorderRecommendation.update({
    where: { inventoryItemId: inventoryMap['mango syrup'] },
    data: {
      status: 'dismissed',
      dismissedById: owner.id,
      dismissedAt: dateAt(7, 15),
      reason: 'Current stock lasts ~65 days. Dismissed — Mango Fruit Tea demand is low this season; no order needed.',
    },
  });

  console.log('Computed recommendations and pre-staged lifecycle records');

  // ── Audit Log ──────────────────────────────────────────────────────────────
  const loginEntries: AuditEntry[] = [
    { userId: worker.id, action: 'LOGIN', details: 'User worker logged in', createdAt: dateAt(28, 8) },
    { userId: owner.id,  action: 'LOGIN', details: 'User owner logged in',  createdAt: dateAt(28, 9) },
    { userId: worker.id, action: 'LOGIN', details: 'User worker logged in', createdAt: dateAt(14, 8) },
    { userId: owner.id,  action: 'LOGIN', details: 'User owner logged in',  createdAt: dateAt(14, 10) },
    { userId: worker.id, action: 'LOGIN', details: 'User worker logged in', createdAt: dateAt(10, 8) },
    { userId: owner.id,  action: 'LOGIN', details: 'User owner logged in',  createdAt: dateAt(10, 9) },
    { userId: worker.id, action: 'LOGIN', details: 'User worker logged in', createdAt: dateAt(7, 8) },
    { userId: owner.id,  action: 'LOGIN', details: 'User owner logged in',  createdAt: dateAt(7, 9) },
    { userId: worker.id, action: 'LOGIN', details: 'User worker logged in', createdAt: dateAt(3, 8) },
    { userId: owner.id,  action: 'LOGIN', details: 'User owner logged in',  createdAt: dateAt(3, 11) },
    { userId: worker.id, action: 'LOGIN', details: 'User worker logged in', createdAt: dateAt(1, 8) },
    { userId: owner.id,  action: 'LOGIN', details: 'User owner logged in',  createdAt: dateAt(1, 9) },
  ];

  const reorderEntries: AuditEntry[] = [
    {
      userId: owner.id,
      action: 'REORDER_CHECK',
      details: 'Scheduled reorder check completed: 3 items flagged for reorder',
      createdAt: dateAt(10, 8),
    },
    {
      userId: owner.id,
      action: 'REORDER_APPROVED',
      details: 'Reorder approved for coffee — 50 bags. Order placed with supplier.',
      createdAt: dateAt(10, 14),
    },
    {
      userId: owner.id,
      action: 'REORDER_DISMISSED',
      details: 'Reorder dismissed for mango syrup. Already overstocked (~65 days of stock). No order needed.',
      createdAt: dateAt(7, 15),
    },
    {
      userId: owner.id,
      action: 'REORDER_APPROVED',
      details: 'Reorder approved for jasmine tea — 40 bags. Delivery expected within 7 days.',
      createdAt: dateAt(5, 14),
    },
    {
      userId: owner.id,
      action: 'INVENTORY_EDIT',
      details: 'Updated reorder threshold for tapioca pearls: 15 → 20 bags (adjusted after repeated critical stock events)',
      createdAt: dateAt(4, 16),
    },
    {
      userId: owner.id,
      action: 'REORDER_COMPLETED',
      details: 'Reorder for coffee marked as completed — 50 bags received and stocked.',
      createdAt: dateAt(3, 10),
    },
    {
      userId: owner.id,
      action: 'ASSISTANT_QUERY_REORDER',
      details: 'Smart Assistant queried: "What should I reorder this week?"',
      createdAt: dateAt(2, 9),
    },
    {
      userId: owner.id,
      action: 'REORDER_CHECK',
      details: 'Manual reorder check triggered: 2 items flagged (tapioca pearls CRITICAL, matcha powder LOW)',
      createdAt: dateAt(1, 8),
    },
  ];

  // Include every-3rd sales entry so the audit log shows a real history without flooding it
  const sampledSalesAudit = salesAuditEntries.filter((_, i) => i % 3 === 0);

  const allAuditEntries = [
    ...loginEntries,
    ...sampledSalesAudit,
    ...adjustmentAuditEntries,
    ...reorderEntries,
  ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  await prisma.auditLog.createMany({ data: allAuditEntries });
  console.log(`Created ${allAuditEntries.length} audit log entries`);

  console.log(`
╔══════════════════════════════════════════════════════╗
║              VP DEMO SEED COMPLETE                   ║
╠══════════════════════════════════════════════════════╣
║  Credentials:  owner / owner123                      ║
║                worker / worker123                    ║
╠══════════════════════════════════════════════════════╣
║  Demo Story:                                         ║
║  🔴 Tapioca pearls  — CRITICAL  (~0.5 days left)     ║
║  🟡 Matcha powder   — LOW       (~3.6 days left)     ║
║  🟢 Jasmine tea     — approved  (order in transit)   ║
║  🟢 Coffee          — completed (restocked 3d ago)   ║
║  🟠 Mango syrup     — dismissed (65 days overstocked)║
║  📈 30 days of sales, Jasmine trending +100%         ║
╚══════════════════════════════════════════════════════╝
`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
