# Oolong — Smart Inventory Manager

A secure, web-based inventory management system for a boba/drink shop. Built for CMPE 272.

## Quick Start

### Option A — Docker (backend + database)

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
# First run: build image, start postgres, seed sample data
SEED_DB=true docker compose up --build

# Subsequent runs (data already in volume)
docker compose up
```

Then run the frontend locally:
```bash
npm install
npm run dev:client   # http://localhost:3000
```

The backend API is available at http://localhost:5000.

### Option B — Fully local

Requires Node.js 18+ and PostgreSQL.

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill in environment variables
cp .env.example server/.env

# 3. Create tables
npm run db:migrate

# 4. Seed sample data
npm run db:seed

# 5. Start both servers
npm run dev
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

### Smart Assistant (Ollama)

The Smart Assistant runs against a **local LLM via [Ollama](https://ollama.com)**. Without it the assistant page still works — it returns a rule-based answer grounded in live DB data instead.

To enable the full LLM experience:

```bash
# Install Ollama: https://ollama.com/download
ollama pull llama3
ollama serve   # starts on http://localhost:11434 by default
```

The model and URL are configurable via env vars (see [Environment Variables](#environment-variables) below).

### Demo Credentials

| Role | Username | Password |
|------|----------|----------|
| Owner | `owner` | `owner123` |
| Worker | `worker` | `worker123` |

## Features

**Worker:**
- View inventory with low-stock and critical-stock warnings
- Log daily drink sales (auto-deducts ingredients via recipes)
- Manually adjust inventory or log waste with a reason

**Owner (all worker views plus):**
- Analytics dashboard with 7-day sales charts, reorder recommendations, and estimated days remaining per ingredient
- **Reorder workflow** — approve / dismiss / complete reorder recommendations with full status history
- **Smart Assistant** (local LLM via Ollama) — ask plain-English questions about inventory and pending reorders; falls back to rule-based output when Ollama is unavailable
- Audit log of all system actions with search and role-based filtering

## Reorder Monitoring

Oolong automatically generates Owner-facing reorder recommendations. **No external supplier integration is performed** — this is a workflow tool: the Owner reviews each recommendation and decides what to do.

### When recommendations are recomputed

A reorder check runs automatically after:

- daily sales submission (post-deduction stock levels are evaluated)
- manual inventory adjustment
- waste logging
- threshold or safety-stock changes by the Owner
- `POST /api/reorders/run-check` (Owner-only on-demand trigger)
- the optional daily scheduled job (see below)

### Recommendation lifecycle

Each ingredient has at most one `ReorderRecommendation` row. Statuses transition like this:

```
pending ──approve──▶ approved ──complete──▶ completed
   │                    │
   ├──dismiss──▶ dismissed
   │
   └─(stock recovers)─▶ resolved
```

The check writes a fresh `reason` on every run (e.g. *"CRITICAL: Only ~0.5 days of stock at 12.0 bags/day usage rate"*) plus a snapshot of the inventory state at generation time. This is what the Smart Assistant cites when answering questions like "Why am I being told to reorder tapioca pearls?".

### API endpoints (all Owner-only)

| Method | Path | Purpose |
|---|---|---|
| `GET`   | `/api/reorders`              | List all recommendations (any status) |
| `GET`   | `/api/reorders/pending`      | List only pending |
| `POST`  | `/api/reorders/run-check`    | Manually trigger a recompute |
| `PATCH` | `/api/reorders/:id/approve`  | Approve a pending recommendation |
| `PATCH` | `/api/reorders/:id/dismiss`  | Dismiss a pending or approved recommendation |
| `PATCH` | `/api/reorders/:id/complete` | Mark a recommendation completed |

Workers receive `403 Insufficient permissions` on all endpoints above.

### Smart Assistant integration

The assistant's context block includes:

- pending recommendations with their reasons and inventory snapshots
- recently approved recommendations (last 14 days)
- live inventory levels and 7-day sales trends

Try questions like:

- *"Which ingredients are critically low right now?"*
- *"What should I order this week?"*
- *"Should I order more mango syrup?"*
- *"How are Jasmine Milk Tea sales trending?"*
- *"Why am I being told to reorder tapioca pearls?"*

Assistant queries that reference reorder concepts are tagged in the audit log as `ASSISTANT_QUERY_REORDER`.

### Optional scheduled job

A daily reorder check is available but disabled by default. Enable via env vars:

```bash
ENABLE_SCHEDULED_REORDER_CHECK=true
REORDER_CHECK_CRON="0 8 * * *"        # used if node-cron is installed
REORDER_CHECK_INTERVAL_HOURS=24       # fallback if node-cron is not installed
SCHEDULER_USER_ID=1                   # optional, defaults to first owner user
```

To use cron expressions, `cd server && npm install node-cron`. Without it, the scheduler falls back to `setInterval` based on `REORDER_CHECK_INTERVAL_HOURS`.

### Audit log entries from this module

| Action | Triggered when |
|---|---|
| `REORDER_CHECK` | A check transitioned at least one recommendation |
| `REORDER_APPROVE` / `_DISMISS` / `_COMPLETE` | Owner workflow actions |
| `ASSISTANT_QUERY_REORDER` | Owner asked the assistant about reorders or low stock |

## Demo Flow

The seed data tells a story across 30 days of realistic sales. Jasmine Milk Tea is the breakout hit with growing week-over-week demand, weekend traffic runs at ~1.8×, and several ingredients are in deliberate distress:

| Ingredient | State | Reorder status |
|---|---|---|
| Tapioca pearls | 🔴 CRITICAL — ~0.5 days remaining | Pending (needs immediate action) |
| Matcha powder | 🟡 LOW — ~3.6 days remaining | Pending |
| Jasmine tea | Stock low — order already placed | Approved (5 days ago) |
| Coffee | Healthy — just restocked | Completed (3 days ago) |
| Mango syrup | 🟠 OVERSTOCK — ~65 days remaining | Dismissed |

**Suggested walkthrough:**

1. Login as `worker` → Dashboard shows critical/low-stock alerts
2. Log today's sales → ingredients auto-deduct
3. Log a waste event (e.g. expired milk)
4. Switch to `owner` → Dashboard shows stats bar, weekend spikes in the sales chart, tapioca near zero in the days-remaining chart
5. Open **Reorders** → Pending tab: approve tapioca pearls, dismiss matcha; Actioned tab: shows the pre-staged approved/completed/dismissed records
6. Open **Smart Assistant** → ask *"Which ingredients are critically low?"* and *"Should I order more mango syrup?"*
7. Open **Audit Log** → search `REORDER` to see the full approval chain; search `worker` to see 30 days of sales history

## Project Structure

```
/
├── client/         # React + Vite frontend (port 3000)
├── server/         # Express + Prisma backend (port 5000)
│   └── prisma/     # Schema, migrations, seed
└── package.json    # Root workspace
```

## Root Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start both servers concurrently |
| `npm run dev:server` | Backend only |
| `npm run dev:client` | Frontend only |
| `npm run db:migrate` | Apply Prisma migrations |
| `npm run db:seed` | Seed demo data |
| `npm run db:reset` | Reset database and re-seed |
| `npm run build` | Compile both workspaces |
| `npm run typecheck` | Type-check both workspaces |

## Environment Variables

Copy `.env.example` to `server/.env` and fill in the required values.

```bash
# Required
DATABASE_URL=postgresql://postgres:password@localhost:5432/oolong
JWT_SECRET=your-long-random-secret
PORT=5000
NODE_ENV=development

# Smart Assistant — local LLM via Ollama (optional; falls back to rule-based if unset)
OLLAMA_URL=http://localhost:11434/api/generate   # default
OLLAMA_MODEL=llama3                              # default
OLLAMA_TIMEOUT_MS=60000                          # default

# Inventory monitoring scheduler (disabled by default)
ENABLE_SCHEDULED_REORDER_CHECK=false
REORDER_CHECK_CRON=0 8 * * *
REORDER_CHECK_INTERVAL_HOURS=24
SCHEDULER_USER_ID=1
```

> **Note:** `GEMINI_API_KEY` appears in `.env.example` as a legacy entry from an earlier version of the assistant. It is not used and can be ignored.
