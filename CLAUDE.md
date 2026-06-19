# CLAUDE.md — Vantage / Beignets & Brew Inventory & Ordering System

This file is the authoritative guide for any AI assistant (Claude, Copilot, GPT, etc.) working in this repository. Read it in full before writing a single line of code.

---

## 1. Project Overview

**Vantage** is an internal inventory and ordering web application for **Beignets & Brew**, a café and bar. It is a production system used daily by real staff. Mistakes in this codebase have real operational consequences.

### Core Features

| Feature | Route | Description |
|---|---|---|
| Dashboard | `/` | Inventory value metrics, order summary, price trend charts |
| Item Catalog | `/catalog` | Full item CRUD, bulk edit, CSV import (PFG, Webstaurant, universal AI-assisted) |
| Count Sheet | `/count` | Live inventory counting with case+each split input, per-item "Done" confirmation |
| Count History | `/count/history` | Past sessions list with per-session CSV export |
| Order Dashboard | `/orders` | Below-par items by vendor, order cost tracking |
| Par Levels | `/par-levels` | Set par levels and order thresholds per item |
| Catering Calculator | `/catering` | Recipe-based catering cost estimator |
| User Management | `/admin/users` | Admin-only user and permission management |
| Settings | `/settings` | Manage categories, vendors, storage areas |
| Account | `/account` | Personal profile and password change |

---

## 2. Architecture — Non-Negotiable Rules

### Stack

- **Frontend:** React 19 + Wouter + TanStack Query v5 + tRPC 11 + Tailwind CSS 4 + shadcn/ui
- **Backend:** Node.js + Express 4 (persistent server — NOT serverless)
- **Database:** TiDB Cloud (MySQL-compatible), accessed via Drizzle ORM + mysql2
- **Email:** Resend API, from domain `getvantageapp.io`
- **File Storage:** S3 via `server/storage.ts` helpers

### Deployment

- **Hosting:** Render (persistent container, NOT Cloud Run, NOT serverless)
- **Build:** `pnpm build` → Vite bundles frontend, esbuild bundles `server/_core/index.ts`
- **Start:** `node dist/index.js`
- **Dev:** `tsx watch server/_core/index.ts`

### Absolute Rules

1. **No serverless functions.** No Vercel config, no Lambda handlers, no edge functions.
2. **No mock or sandbox database.** All schema changes go to the live TiDB Cloud instance via `webdev_execute_sql` or the `DATABASE_URL` connection string.
3. **All schema changes require a migration.** Edit `drizzle/schema.ts` → run `pnpm drizzle-kit generate` → read the generated `.sql` → apply via `webdev_execute_sql`. Never skip this.
4. **Emails via Resend only.** Use `server/email.ts` helpers. Sender must be `Beignets & Brew <noreply@getvantageapp.io>` or similar `@getvantageapp.io` address.
5. **No Axios or raw fetch wrappers.** All client↔server calls go through tRPC hooks (`trpc.*.useQuery` / `trpc.*.useMutation`).
6. **Review existing files before writing new ones.** This codebase has many established patterns. Duplicating a module or reimplementing an existing helper is a bug.

---

## 3. Repository Layout

```
drizzle/
  schema.ts          ← Single source of truth for all DB tables and types
  migrations/        ← Generated SQL migration files (do not edit manually)

server/
  _core/             ← Framework plumbing — DO NOT EDIT unless extending infra
    index.ts         ← Express server entry point
    context.ts       ← tRPC context (injects ctx.user)
    trpc.ts          ← publicProcedure, protectedProcedure, adminProcedure
    env.ts           ← Typed env var access — use ENV.* everywhere
    llm.ts           ← invokeLLM() helper
    notification.ts  ← notifyOwner() helper
  db.ts              ← ALL database query helpers (the data layer)
  routers.ts         ← ALL tRPC procedures (the API layer)
  email.ts           ← Transactional email senders (Resend)
  storage.ts         ← S3 storagePut / storageGet helpers
  *.test.ts          ← Vitest specs

client/src/
  App.tsx            ← Route definitions
  components/
    AppLayout.tsx    ← Authenticated shell with nav, permission gating
    DashboardLayout.tsx ← (template, not used for main nav)
    ui/              ← shadcn/ui components — import from @/components/ui/*
  pages/             ← One file per route
  contexts/          ← React contexts
  hooks/             ← Custom hooks
  lib/trpc.ts        ← tRPC client binding

shared/
  constants.ts       ← CATEGORIES, VENDORS, STORAGE_AREAS, UNITS, ALCOHOL_CATEGORIES
  types.ts           ← Shared TypeScript types
```

---

## 4. Database Schema Reference

All tables are in TiDB Cloud (MySQL). Key design decisions:

### `items` — Item Catalog

| Column | Type | Notes |
|---|---|---|
| `price` | `decimal(10,2)` | Case price as string from DB (e.g. `"24.99"`) |
| `parLevel` | `decimal(10,2)` | Whole numbers only in UI; stored as `"8.00"` — always `Math.floor(parseFloat(...))` before displaying |
| `orderThreshold` | `decimal(4,2)` | Stored as `0–100` percentage (e.g. `50` = 50%). Default `50`. Trigger: `currentStock ≤ parLevel × (threshold/100)` |
| `caseQty` | `int` | Units per case, parsed from `packSize` by `parsePackSizeQty()` |
| `eachPrice` | `decimal(10,4)` | `price / caseQty`, stored to 4 decimal places. Recomputed by `recalcAllEachPrices()` |
| `countMode` | `varchar(8)` | `"case"` (default) or `"each"`. Controls how quantity is stored and displayed |
| `isActive` | `boolean` | Soft-delete flag. `getAllItems()` only returns `isActive = true` items |

**Critical:** `price`, `parLevel`, `eachPrice`, `orderThreshold` all come back from the DB as **strings** (Drizzle decimal → string). Always `parseFloat()` before arithmetic.

### `count_entries` — Count Session Entries

| Column | Type | Notes |
|---|---|---|
| `quantity` | `decimal(10,4)` | Fractional case value. For case-mode: `cases + eaches/caseQty`. For each-mode: raw eaches count |
| `confirmed` | `boolean` | Set to `true` when user clicks "Done" on an item |

### Counting Math — The Single Source of Truth

**Case-mode items** (most items):
- User enters: `2 cases + 6 eaches` (where caseQty = 24)
- Stored as: `2 + 6/24 = 2.25`
- Value: `2.25 × price` (NOT `cases × price + eaches × eachPrice` — this causes rounding drift)
- Display split: `cases = Math.floor(2.25)`, `eaches = Math.round((2.25 - 2) × 24)`

**Each-mode items** (individual units, e.g. bottles counted one by one):
- User enters: `14` eaches
- Stored as: `14` (raw eaches, no conversion)
- Value: `14 × eachPrice`
- For ordering: `rawQty / caseQty` to convert back to cases

**Total value formula (both app and CSV must use this):**
```ts
// For each entry:
const qty = parseFloat(entry.quantity);
const price = parseFloat(entry.price ?? "0");
const eachPrice = parseFloat(entry.eachPrice ?? "0");
const isEachMode = entry.countMode === "each";
const itemValue = Math.round((isEachMode ? qty * eachPrice : qty * price) * 100) / 100;
```

Round each item to 2 decimal places **before** summing to prevent floating-point drift.

---

## 5. tRPC Procedure Guards

Three procedure types are defined in `server/_core/trpc.ts`:

| Guard | Who can call it |
|---|---|
| `publicProcedure` | Anyone (unauthenticated) |
| `protectedProcedure` | Any logged-in user |
| `adminProcedure` | Users with `role === "admin"` only |

Two custom guards are defined inline in `server/routers.ts`:

| Guard | Who can call it |
|---|---|
| `parLevelsProcedure` | Admins OR users with `"par_levels"` permission |

### Permission Keys

Permissions are stored as a JSON array of strings in `users.permissions`. Current keys:

| Key | Grants access to |
|---|---|
| `count_sheet` | Count Sheet page and procedures |
| `place_orders` | Order Dashboard page |
| `par_levels` | Par Levels page + `updateParLevel`, `bulkUpdateParLevels`, `updateOrderThreshold`, `bulkUpdateOrderThresholds` |
| `user_management` | User Management page |

Admins automatically have all permissions. Non-admins only see nav items and can only call procedures for permissions they hold.

**When adding a new permission-gated feature:**
1. Add the permission key to `ALL_PERMISSIONS` in `client/src/pages/UserManagement.tsx`
2. Add `permission: "your_key"` to the nav item in `client/src/components/AppLayout.tsx`
3. Add an access guard at the top of the page component
4. Create a custom procedure guard in `server/routers.ts` (like `parLevelsProcedure`)

---

## 6. Development Workflow

### Adding a Feature (the four-step loop)

1. **Schema** — Edit `drizzle/schema.ts`, run `pnpm drizzle-kit generate`, read the generated SQL, apply via `webdev_execute_sql`.
2. **DB helpers** — Add query functions to `server/db.ts`. Return raw Drizzle rows. Keep business logic here.
3. **Procedures** — Add or extend tRPC procedures in `server/routers.ts`. Choose the right guard. Keep routers thin — call `db.ts` helpers.
4. **UI** — Build the page in `client/src/pages/`. Use `trpc.*.useQuery/useMutation`. Handle loading, empty, and error states.

### Commands

```bash
pnpm dev          # Start dev server (tsx watch)
pnpm build        # Production build
pnpm start        # Run production build
pnpm check        # TypeScript type check (no emit)
pnpm test         # Run all Vitest specs
pnpm db:push      # Generate migration + apply to DB
```

### Testing

- Tests live in `server/*.test.ts`
- Use Vitest. Mock `./db` module with `vi.mock("./db", () => ({ ... }))`
- Every new procedure or DB helper should have a corresponding test
- Run `pnpm test` before every checkpoint

---

## 7. Frontend Conventions

### Input Fields

- **Never use `type="number"`** for par levels, thresholds, quantities, or prices. Use `type="text"` with `inputMode="numeric"`. Number inputs format values based on OS locale (e.g. `50.00` instead of `50`).
- **Par levels and order thresholds are whole numbers.** Block the decimal key on `keydown` and strip decimals on `onChange`.
- **Prices** may have 2 decimal places.

### Displaying DB Decimal Values

All `decimal` columns come back from TiDB as strings (e.g. `"50.00"`, `"24.99"`). Before displaying in an input or as a whole number:

```ts
// Par level (whole number)
const display = String(Math.floor(parseFloat(item.parLevel ?? "0")));

// Price (2 decimal places)
const display = parseFloat(item.price ?? "0").toFixed(2);
```

### State Management

- Use `trpc.*.useQuery` for server state. Never introduce Axios or raw fetch.
- Use optimistic updates (`onMutate` / `onError` / `onSettled`) for list operations, toggles, and inline edits.
- Use `invalidate` in `onSuccess` for critical operations (auth, payments, destructive actions).
- Stabilize query inputs with `useState` or `useMemo` — never create objects/arrays inline in query inputs (causes infinite re-fetch loops).

### Count Sheet Specifics

The Count Sheet maintains two parallel state maps:
- `localCounts`: `Record<itemId, string>` — cases entered by user (or loaded from DB)
- `localEachCounts`: `Record<itemId, string>` — eaches entered by user (or loaded from DB)

On DB load, fractional quantities are split back:
```ts
const cases = Math.floor(total);
const eaches = caseQty > 1 ? Math.round((total - cases) * caseQty) : 0;
```

The `totalValue` and group subtotals **must** use `entry.quantity` from `sessionData.entries` (the raw DB value), not re-split from `localCounts`. Re-splitting introduces rounding drift. The local state maps are only for display in the input fields.

---

## 8. Business Rules

### Order Threshold Logic

```
triggerLevel = parLevel × (orderThreshold / 100)
needsOrder = parLevel > 0 && currentStock ≤ triggerLevel
```

- `orderThreshold` is stored as a percentage (0–100), **not** a fraction (0.0–1.0).
- Default threshold: 50 (order when stock drops to 50% of par or below).
- For each-mode items, convert to cases before comparing: `currentStock = rawEaches / caseQty`.

### Pack Size Parsing

`parsePackSizeQty(packSize)` in `server/db.ts` extracts `caseQty` from strings like:
- `"6/24oz"` → 6
- `"4/6/12 OZ"` → 24 (4 × 6)
- `"2/12 PK"` → 24 (2 × 12)
- `"12/750 ML"` → 12
- `"1/50 LB"` → 1
- `"- 25/Case"` → 25 (Webstaurant format)

`eachPrice = price / caseQty` (stored to 4 decimal places). Recompute with `recalcAllEachPrices()` after bulk price imports.

### Soft Delete

Items are never hard-deleted. `deleteItem()` sets `isActive = false`. `getAllItems()` filters `isActive = true`. However, `getSessionWithEntries()` joins on `count_entries` and returns items regardless of active status — this is intentional so historical count data is preserved.

### CSV Export

The count session CSV export (`counts.exportSession`) uses `entry.quantity` (raw fractional DB value) directly for value calculations. The split into Cases/Eaches columns is display-only. Value formula: `Math.round(qty × price × 100) / 100` per item, then sum.

---

## 9. Canonical Data Values

Always use these exact strings. They are enforced in `shared/constants.ts` and the Settings tables.

**Categories:** `Alcohol - 100`, `Alcohol - 130`, `Coffee`, `Bakery`, `Dairy`, `Dry Goods`, `Paper Goods`, `Produce`, `Protein`, `Syrups`, `Supplies`, `Other`

**Vendors:** `PFG`, `Webstaurant`, `Savannah Distributing`, `Other`

**Storage Areas:** `Dry Storage`, `Walk-In`, `Freezer`, `Bar`, `Other`

**Count Modes:** `case` (default), `each`

**Alcohol Categories:** `100` (beer/spirits/hemp), `130` (wine)

---

## 10. Email

All transactional emails go through `server/email.ts`. The three helpers are:

- `sendWelcomeEmail({ to, name, tempPassword, loginUrl })` — sent when admin creates a new user
- `sendPasswordResetRequestEmail({ to, name, resetUrl })` — sent on forgot-password flow
- `sendAdminPasswordResetEmail({ to, name, tempPassword, loginUrl })` — sent when admin resets a user's password

All helpers are fail-soft: they catch errors internally and return `{ success, error? }`. They skip silently if `RESEND_API_KEY` is not set. Never throw on email failure.

---

## 11. Common Pitfalls

### Decimal columns display as "50.00"

TiDB returns `decimal` columns as strings. Always `Math.floor(parseFloat(...))` for whole-number fields (parLevel, orderThreshold) before displaying. Use `type="text"` not `type="number"` for inputs.

### Value totals don't match between app and CSV

Both sides must use the identical formula: `Math.round(parseFloat(entry.quantity) × parseFloat(item.price) × 100) / 100`. Do not re-split fractional quantities for value math — only split for display.

### Inactive items missing from totals

`getAllItems()` filters `isActive = true`. `getSessionWithEntries()` does not. If a counted item was later deactivated, it appears in the CSV (via session entries) but not in the app's item list. The app's total must read from `sessionData.entries`, not from `allItems`.

### Infinite re-fetch loops

Never create objects or arrays inline as tRPC query inputs. Stabilize with `useState` or `useMemo`.

### Permission not enforced on the page

Adding a permission to the nav is not enough. Also add an access guard inside the page component that checks `user.permissions.includes("key")` and renders an "Access Restricted" message if false. Direct URL navigation bypasses nav-level guards.

### Schema drift

The TypeScript schema (`drizzle/schema.ts`) and the live TiDB database must always be in sync. If you add a column to the schema without running a migration, the app will crash in production. Always run `pnpm drizzle-kit generate` and apply the SQL before committing.

---

## 12. GitHub & Deployment

- **Repository:** `walkernetworks/Vantage` (private), branch `main`
- **Auto-deploy:** Render watches `main` and deploys on push
- **Manual deploy:** Render dashboard → service → "Manual Deploy" → "Deploy latest commit"
- **Push workflow:** After every feature, commit and push the changed files to `main`. Render will pick it up automatically within a few minutes.

After pushing, if the change is not live within 5 minutes, check the Render dashboard for a failed build log.
