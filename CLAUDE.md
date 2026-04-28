# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Oolong is a secure, web-based Smart Inventory Manager for a small boba/drink shop (CMPE 272 class project). Two roles — **Owner** and **Worker** — have distinct permissions. The core flow is: Workers log daily drink sales → ingredients are auto-deducted via recipes → Owners view analytics and ask a Claude-powered Smart Assistant about inventory/reorder decisions.

## Stack

- **Frontend**: React + TypeScript (`client/`) — Vite, React Router, Recharts, Axios
- **Backend**: Node.js + Express + TypeScript (`server/`)
- **ORM**: Prisma with PostgreSQL
- **Auth**: JWT + bcrypt
- **AI**: Google Gemini API (`gemini-2.0-flash`) — Owner-only Smart Assistant
- **Validation**: Zod on all backend routes

## Docker (backend only)

```bash
# First run — builds image, starts postgres + server, seeds sample data
SEED_DB=true docker compose up --build

# Subsequent runs (data already in volume)
docker compose up

# Rebuild after code changes
docker compose up --build

# Tear down (keeps postgres volume)
docker compose down

# Tear down + wipe database
docker compose down -v
```

`GEMINI_API_KEY` and `JWT_SECRET` can be passed as env vars:
```bash
JWT_SECRET=mysecret GEMINI_API_KEY=AIza... SEED_DB=true docker compose up --build
```

The server container syncs the DB schema with `prisma db push` on every start (idempotent). The frontend still runs locally with `npm run dev:client`.

## Local dev commands

```bash
# Install all dependencies (run from repo root)
npm install

# Start both frontend and backend in dev mode
npm run dev

# Backend only (port 5000)
npm run dev:server

# Frontend only (port 3000)
npm run dev:client

# Build for production
npm run build

# Database (run from repo root — delegates to server workspace)
npm run db:migrate      # prisma migrate dev
npm run db:seed         # prisma db seed
npm run db:generate     # prisma generate
npm run db:reset        # prisma migrate reset

# Type-check
npm run typecheck
```

## Architecture

### Monorepo layout

```
/
├── client/
│   └── src/
│       ├── pages/        # Login, WorkerDashboard, SalesEntry, InventoryEdit,
│       │                 # OwnerDashboard, Assistant, AuditLog
│       ├── components/   # ProtectedRoute, Layout (sidebar nav)
│       ├── api/          # Axios client + typed wrappers per domain
│       └── context/      # AuthContext (JWT, role, login/logout)
├── server/
│   └── src/
│       ├── routes/       # auth, inventory, sales, analytics, assistant, audit, reorders
│       ├── controllers/  # thin — parse/validate input, call service, call audit
│       ├── services/     # business logic (auth, inventory, sales, analytics, assistant, audit,
│       │                 #                 reorder, scheduler)
│       ├── middleware/   # authenticate (JWT), authorize(role), errorHandler
│       ├── lib/          # prisma.ts singleton
│       └── types/        # JwtPayload + Express Request augmentation
│   └── prisma/
│       ├── schema.prisma
│       └── seed.ts
└── .env.example          # copy to server/.env and fill in values
```

### Backend module responsibilities

| Module | Key responsibility |
|---|---|
| `auth` | Login, JWT issue/verify, bcrypt compare |
| `inventory` | CRUD on `inventory_items`, worker adjustments, owner threshold edits |
| `sales` | Submit daily sales → Prisma transaction deducts ingredient quantities |
| `analytics` | 7-day moving average, days-remaining, reorder/overstock detection; upserts `reorder_recommendations` |
| `assistant` | Builds live DB context, calls `gemini-2.0-flash` via Google GenAI SDK |
| `audit` | Append-only `audit_logs`; controllers call it after successful operations |
| `reorder` | Owns `ReorderRecommendation` lifecycle: `runReorderCheck()` recomputes stock health and reconciles statuses (pending/approved/dismissed/completed/resolved); exposes Owner-only approve/dismiss/complete actions; called from sales, inventory, and threshold trigger points and from the optional `scheduler` service |
| `scheduler` | Optional daily reorder check. Reads `ENABLE_SCHEDULED_REORDER_CHECK` + `REORDER_CHECK_CRON` (uses `node-cron` if installed, else `setInterval`). No-op when disabled |

### Database schema (Prisma models)

`User` · `InventoryItem` · `Recipe` · `RecipeIngredient` · `DailySales` · `DailySalesItem` · `InventoryAdjustment` · `ReorderRecommendation` · `AuditLog`

Key flows:
- **Sales submission** (`sales.service.ts`): single `prisma.$transaction` — creates `DailySales` + `DailySalesItem` records, decrements `InventoryItem.currentQuantity` for every recipe ingredient
- **Analytics refresh** (`analytics.service.ts`): called after each sales submission; upserts all `ReorderRecommendation` rows based on 7-day usage sums

### Auth & RBAC

- `authenticate` middleware: verifies JWT, attaches `req.user` (`JwtPayload`)
- `authorize(...roles)` middleware: guards owner-only routes (`/analytics`, `/assistant`, `/audit`, inventory thresholds)
- Frontend: `AuthContext` + `ProtectedRoute` — redirects to correct home if wrong role

### Smart Assistant (RAG pattern)

`assistant.service.ts` builds a text context block from live Postgres data (inventory status, reorder flags, 7-day sales, recent waste), prepends it as the user message, then calls `ai.models.generateContent`. Fails gracefully with `503` if `GEMINI_API_KEY` is missing. Every query is audit-logged.

### Analytics / Recommendations logic

```
totalUsage[ingredient] = Σ(dailySalesItem.quantity × recipeIngredient.quantity) over last 7 days
avgDailyUsage = totalUsage / 7
daysRemaining = currentQuantity / avgDailyUsage  (999 if avgDailyUsage == 0)
reorderNeeded = currentQuantity ≤ threshold + safetyStock  OR  (avgDailyUsage > 0 AND daysRemaining < 7)
recommendedQty = max(0, avgDailyUsage × 14 − currentQuantity + threshold + safetyStock)
isOverstock = avgDailyUsage > 0 AND daysRemaining > 30
```

## Environment Variables

`server/.env` (copy from `.env.example`):

```
DATABASE_URL=postgresql://postgres:password@localhost:5432/oolong
JWT_SECRET=change-this-to-a-long-random-secret
GEMINI_API_KEY=AIza...
PORT=5000
NODE_ENV=development
```

## Seed Data

`server/prisma/seed.ts`: one Owner (`owner`/`owner123`), one Worker (`worker`/`worker123`), all 9 ingredients with quantities/thresholds, 5 drink recipes with ingredient mappings, 7 days of sample sales, 3 sample inventory adjustments. Run `npm run db:seed`.

The seed intentionally leaves several ingredients near or below their reorder thresholds so analytics and recommendations are visible immediately.

## Drinks & Canonical Recipes

| Drink | Ingredients (×1 each) |
|---|---|
| Matcha Latte | matcha powder, milk |
| Jasmine Milk Tea | jasmine tea, milk, sugar syrup, tapioca pearls |
| Mango Fruit Tea | mango syrup, sugar syrup |
| Vietnamese Coffee | coffee, condensed milk |
| Oolong Milk Tea | oolong tea, milk, tapioca pearls |

Recipes are stored in the DB (`recipes` + `recipe_ingredients` tables), not hardcoded.
