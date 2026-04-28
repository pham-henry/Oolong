/**
 * Smart Inventory Assistant — Local LLM (Ollama) integration
 *
 * RAG-style flow:
 *   1. buildContext()      — query Postgres for live inventory, low-stock,
 *                            reorder recommendations, and 7-day sales trends,
 *                            then format as a human-readable text block.
 *   2. constructPrompt()   — wrap the context + user question in a system
 *                            prompt instructing the model to behave as a
 *                            business inventory analyst grounded ONLY in the
 *                            provided data.
 *   3. callOllama()        — POST to http://localhost:11434/api/generate.
 *   4. ruleBasedFallback() — if Ollama is unreachable, return a deterministic
 *                            recommendation summary built from the same data,
 *                            so the user still gets useful output instead of
 *                            an opaque error.
 *
 * Errors are surfaced as typed `AssistantError` instances so the controller
 * can map them to clean HTTP responses without crashing the server.
 */

import { prisma } from '../lib/prisma';
import { getAssistantRelevantRecommendations } from './reorder.service';

// --- Configuration --------------------------------------------------------

const OLLAMA_URL =
  process.env.OLLAMA_URL ?? 'http://localhost:11434/api/generate';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'llama3';
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 60_000);

const SYSTEM_PROMPT = `You are an inventory assistant for a small beverage shop.
You behave as a business inventory analyst.
Use ONLY the data provided in the context below — do not invent numbers, items,
trends, or recommendations that are not supported by that data. If the answer
cannot be determined from the context, say so plainly. Explain your reasoning
clearly and reference the actual quantities, thresholds, and sales figures.`;

// --- Custom error type ---------------------------------------------------

export class AssistantError extends Error {
  public readonly code:
    | 'OLLAMA_UNREACHABLE'
    | 'OLLAMA_BAD_RESPONSE'
    | 'OLLAMA_TIMEOUT'
    | 'INVALID_INPUT';
  public readonly fallback?: string;

  constructor(
    code: AssistantError['code'],
    message: string,
    fallback?: string
  ) {
    super(message);
    this.code = code;
    this.fallback = fallback;
  }
}

// --- Context retrieval ---------------------------------------------------

/**
 * Pulls live data from Postgres and formats it as a single readable string
 * for the LLM prompt. Includes:
 *   - current inventory levels (with LOW marker)
 *   - explicit reorder recommendations
 *   - 7-day average daily sales per drink
 *   - recent waste / manual adjustments
 */
export async function buildContext(): Promise<{
  text: string;
  raw: ContextSnapshot;
}> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Run independent queries in parallel for speed. The reorder service is the
  // single source of truth for pending + recently-approved recommendations.
  const [inventory, salesItems, adjustments, recs] = await Promise.all([
    prisma.inventoryItem.findMany({
      orderBy: { name: 'asc' },
      include: { reorderRecommendations: true },
    }),
    prisma.dailySalesItem.findMany({
      where: { dailySales: { date: { gte: sevenDaysAgo } } },
      include: { recipe: true },
    }),
    prisma.inventoryAdjustment.findMany({
      where: {
        createdAt: { gte: sevenDaysAgo },
        type: { in: ['waste', 'manual'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        inventoryItem: { select: { name: true, unit: true } },
        adjustedBy: { select: { username: true } },
      },
    }),
    getAssistantRelevantRecommendations(),
  ]);

  // Aggregate sales per drink for the 7-day window.
  const drinkTotals: Record<string, number> = {};
  for (const si of salesItems) {
    drinkTotals[si.recipe.drinkName] =
      (drinkTotals[si.recipe.drinkName] ?? 0) + si.quantity;
  }

  // --- Format the readable text block --------------------------------------
  const lines: string[] = [];
  lines.push('Inventory:');
  for (const item of inventory) {
    const isLow =
      item.currentQuantity <= item.reorderThreshold + item.safetyStock;
    const lowTag = isLow ? ' (LOW)' : '';
    lines.push(`${item.name}: ${item.currentQuantity} ${item.unit}${lowTag}`);
  }

  // Pending recommendations awaiting Owner action.
  lines.push('');
  lines.push('Pending Reorder Recommendations:');
  if (recs.pending.length === 0) {
    lines.push('- No pending recommendations.');
  } else {
    for (const r of recs.pending) {
      const days =
        r.daysRemaining >= 999
          ? 'no recent usage'
          : `${r.daysRemaining.toFixed(1)} days remaining`;
      lines.push(
        `- ${r.ingredientName}: order ~${r.recommendedQty.toFixed(0)} ${r.unit} (${days}). Reason: ${r.reason ?? 'low stock'}`
      );
    }
  }

  // Recently approved — Owner already acted, useful context for follow-up
  // questions like "did I order milk?".
  if (recs.recentlyApproved.length > 0) {
    lines.push('');
    lines.push('Recently Approved Recommendations (last 14 days):');
    for (const r of recs.recentlyApproved) {
      const when = r.approvedAt
        ? r.approvedAt.toISOString().slice(0, 10)
        : '—';
      lines.push(
        `- ${r.ingredientName}: ~${r.recommendedQty.toFixed(0)} ${r.unit}, approved ${when} by ${r.approvedBy?.username ?? 'owner'}`
      );
    }
  }

  lines.push('');
  lines.push('Sales Trends (last 7 days):');
  const drinkEntries = Object.entries(drinkTotals);
  if (drinkEntries.length === 0) {
    lines.push('- No sales recorded in the last 7 days.');
  } else {
    for (const [drink, qty] of drinkEntries) {
      const avg = (qty / 7).toFixed(1);
      lines.push(`- ${drink}: avg ${avg}/day (${qty} total)`);
    }
  }

  if (adjustments.length > 0) {
    lines.push('');
    lines.push('Recent Adjustments / Waste:');
    for (const adj of adjustments) {
      const sign = adj.delta >= 0 ? '+' : '';
      lines.push(
        `- ${adj.inventoryItem.name}: ${sign}${adj.delta} ${adj.inventoryItem.unit} (${adj.type}) — ${adj.reason}`
      );
    }
  }

  const raw: ContextSnapshot = {
    inventory: inventory.map((i) => ({
      name: i.name,
      unit: i.unit,
      currentQuantity: i.currentQuantity,
      reorderThreshold: i.reorderThreshold,
      safetyStock: i.safetyStock,
      isLow: i.currentQuantity <= i.reorderThreshold + i.safetyStock,
    })),
    reorder: recs.pending.map((r) => ({
      name: r.ingredientName,
      unit: r.unit,
      recommendedQty: r.recommendedQty,
      daysRemaining: r.daysRemaining,
    })),
    salesTrends: Object.fromEntries(
      Object.entries(drinkTotals).map(([k, v]) => [k, v / 7])
    ),
  };

  return { text: lines.join('\n'), raw };
}

interface ContextSnapshot {
  inventory: Array<{
    name: string;
    unit: string;
    currentQuantity: number;
    reorderThreshold: number;
    safetyStock: number;
    isLow: boolean;
  }>;
  reorder: Array<{
    name: string;
    unit: string;
    recommendedQty: number;
    daysRemaining: number;
  }>;
  salesTrends: Record<string, number>;
}

// --- Prompt construction --------------------------------------------------

function constructPrompt(contextText: string, question: string): string {
  // Single concatenated prompt — Ollama's /api/generate takes a single string.
  return `${SYSTEM_PROMPT}

${contextText}

User Question:
${question}

Answer:`;
}

// --- Ollama call ----------------------------------------------------------

interface OllamaGenerateResponse {
  response?: string;
  error?: string;
}

/**
 * Calls the local Ollama HTTP API. Uses AbortController so a hung Ollama
 * process can never wedge the request thread.
 */
async function callOllama(prompt: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    // Network failure (Ollama not running, DNS, refused connection, abort).
    if ((err as Error).name === 'AbortError') {
      throw new AssistantError(
        'OLLAMA_TIMEOUT',
        `Ollama request timed out after ${OLLAMA_TIMEOUT_MS}ms`
      );
    }
    throw new AssistantError(
      'OLLAMA_UNREACHABLE',
      `Could not reach Ollama at ${OLLAMA_URL}: ${(err as Error).message}`
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new AssistantError(
      'OLLAMA_BAD_RESPONSE',
      `Ollama returned HTTP ${res.status}: ${body.slice(0, 200)}`
    );
  }

  const data = (await res.json()) as OllamaGenerateResponse;
  if (data.error) {
    throw new AssistantError('OLLAMA_BAD_RESPONSE', `Ollama error: ${data.error}`);
  }
  if (!data.response || !data.response.trim()) {
    throw new AssistantError('OLLAMA_BAD_RESPONSE', 'Empty response from Ollama');
  }

  return data.response.trim();
}

// --- Rule-based fallback --------------------------------------------------

/**
 * Deterministic, dependency-free fallback used when Ollama is unavailable.
 * Produces a short summary grounded in the same DB snapshot we'd have fed
 * to the LLM, so the Owner always gets actionable output.
 */
function ruleBasedFallback(question: string, snapshot: ContextSnapshot): string {
  const lines: string[] = [];
  lines.push(
    '⚠️ The local LLM is unavailable. Returning a rule-based summary instead.'
  );
  lines.push('');

  const lowItems = snapshot.inventory.filter((i) => i.isLow);
  if (lowItems.length > 0) {
    lines.push('Low-stock items needing attention:');
    for (const i of lowItems) {
      lines.push(
        `- ${i.name}: ${i.currentQuantity} ${i.unit} (threshold ${i.reorderThreshold})`
      );
    }
  } else {
    lines.push('All inventory items are above their reorder thresholds.');
  }

  if (snapshot.reorder.length > 0) {
    lines.push('');
    lines.push('Recommended reorders:');
    for (const r of snapshot.reorder) {
      const days =
        r.daysRemaining >= 999
          ? 'no recent usage'
          : `${r.daysRemaining.toFixed(1)} days left`;
      lines.push(`- ${r.name}: order ~${r.recommendedQty.toFixed(0)} ${r.unit} (${days})`);
    }
  }

  const topSellers = Object.entries(snapshot.salesTrends)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  if (topSellers.length > 0) {
    lines.push('');
    lines.push('Top sellers (avg/day, last 7 days):');
    for (const [drink, avg] of topSellers) {
      lines.push(`- ${drink}: ${avg.toFixed(1)}/day`);
    }
  }

  lines.push('');
  lines.push(`(Original question: "${question}")`);
  return lines.join('\n');
}

// --- Public entry point ---------------------------------------------------

export interface AssistantResult {
  answer: string;
  source: 'ollama' | 'fallback';
}

/**
 * Orchestrates the RAG flow. Always resolves with an answer — if Ollama is
 * down it returns a rule-based fallback rather than throwing, so the route
 * stays useful and the server never crashes.
 */
export async function askAssistant(question: string): Promise<AssistantResult> {
  if (typeof question !== 'string' || question.trim().length === 0) {
    throw new AssistantError('INVALID_INPUT', 'Question must be a non-empty string');
  }

  const { text: contextText, raw } = await buildContext();
  const prompt = constructPrompt(contextText, question);

  try {
    const answer = await callOllama(prompt);
    return { answer, source: 'ollama' };
  } catch (err) {
    // Don't crash — return a deterministic fallback grounded in DB data.
    if (err instanceof AssistantError) {
      const fallback = ruleBasedFallback(question, raw);
      return { answer: fallback, source: 'fallback' };
    }
    throw err;
  }
}
