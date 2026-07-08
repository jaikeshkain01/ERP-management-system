# StackIOT ERP — API Implementation Log

> **Living document.** Every API route/service written for the backend is recorded here with
> its *actual* logic — not just the contract, but what the code does inside: validation,
> permission gate, tenant/RLS handling, the Prisma calls it makes, transaction boundaries, and
> side effects (ledger writes, notifications, audit trail). Keep it in lockstep with the code.
>
> **Companion docs:** [`ARCHITECTURE.md`](ARCHITECTURE.md) (screens → data → proposed contract)
> and [`schema.sql`](schema.sql) (the DB source of truth). This file is the *implementation*
> layer between them.

---

## How to keep this file updated

When you write or change an endpoint/service:

1. Find its entry in the **Endpoint catalog** below (or add one under the right module).
2. Flip its status and fill in the **entry template** with the real implementation.
3. If you introduce a new cross-cutting pattern (a new error code, a new guard, a helper),
   document it once under **Conventions** and link to it instead of repeating.
4. Note the source file(s) with clickable paths, e.g. `src/app/api/components/route.ts`.
5. Keep the "Last updated" line current.

**Status legend:** ⬜ Not implemented · 🟡 In progress · ✅ Done · ⚠️ Needs revisit

_Last updated: 2026-07-08 — scaffold created; no endpoints implemented yet._

---

## Conventions (cross-cutting — read once)

These apply to **every** endpoint unless its entry says otherwise. Documented here so per-endpoint
entries stay short.

### Tenancy & RLS — non-negotiable
- The active company/user come from the **session**, never from the URL/query/body. No endpoint
  takes a `companyId`. (See [`ARCHITECTURE.md §7f`](ARCHITECTURE.md).)
- **All tenant-scoped DB work goes through `withTenant(ctx, fn)`** ([src/lib/prisma.ts](../src/lib/prisma.ts)),
  which opens a transaction and sets `app.current_company_id` / `app.current_user_id`. A bare
  `prisma.*` call outside it runs with no tenant context and **returns 0 rows** (RLS default) —
  that is the safe failure mode, not a bug.
- The runtime connects as `erp_app` (NOBYPASSRLS). It **cannot** write `audit_logs` (trigger-only)
  or mutate `inventory_transactions` (append-only). Corrections are reversing entries.

### AuthN / AuthZ
- **AuthN:** _(TBD — session/JWT strategy not yet chosen. Fill in when auth is built.)_
- **AuthZ:** each route requires a `resource.action` permission (§7h). Gate helper: _(TBD)_.
  The check stacks with module licensing (§4): module must be licensed **and** role must permit.

### Request validation
- _(TBD — validation library/pattern not yet chosen, e.g. zod schemas per route. Decide on the
  first endpoint and record here.)_

### Response & error shape
- _(TBD — define the success envelope and error body/status codes on the first endpoint.)_

### Soft delete
- Never hard-DELETE tenant rows: set `deleted_at`. Reads filter `deleted_at IS NULL` (most
  are already scoped by RLS + partial unique indexes; add the filter explicitly in queries).

### Derived / computed fields
- Stock and BOM roll-ups are **never stored** — compute from the inventory ledger / BOM
  (§7a, §7d, and the selector list in `ARCHITECTURE.md §2`). Record the exact query per endpoint.

---

## Entry template

Copy this block for each endpoint when you implement it.

```md
### <METHOD> <path>   — <status emoji>
- **Source:** `src/app/api/.../route.ts` (+ service `src/lib/server/...`)
- **Permission:** `resource.action` (or "public" / "session only")
- **Purpose:** one line.
- **Request:** params / query / body shape (+ validation rules).
- **Logic:**
  1. Step-by-step of what the handler does.
  2. Guard → validate → `withTenant` → queries → shape response.
- **DB access:** tables read/written; the Prisma calls or raw SQL; transaction boundary.
- **Side effects:** ledger rows, notifications, approvals, audit (auto via trigger), cache.
- **Returns:** success shape + status; error cases + statuses.
- **Derived fields computed:** which, and how.
- **Notes / gotchas / TODO.**
```

---

## Endpoint catalog

Grouped by module, mirroring the suggested REST endpoints in
[`ARCHITECTURE.md §7`](ARCHITECTURE.md). All ⬜ until implemented — expand each into a full
template entry as it's built.

### Auth & tenant session
- ⬜ `POST /auth/login` — returns token + the user's companies (memberships)
- ⬜ `GET  /me/companies` — companies this user can access
- ⬜ `POST /session/company` — switch active company (re-issues token/claim)
- ⬜ `GET  /me` — current user + active company + effective permissions

### RBAC admin
- ⬜ `GET  /permissions` — the resource × action matrix (static app constant, §7h)
- ⬜ `GET  /roles` · `GET /roles/{id}`
- ⬜ `POST /roles` · `PATCH /roles/{id}` · `DELETE /roles/{id}`
- ⬜ `PUT  /roles/{id}/permissions` — set granted (resource, action) pairs
- ⬜ `GET  /users` `?q` — members of the active company
- ⬜ `PUT  /memberships/{id}/role` — set a user's role in the active company

### Products
- ⬜ `GET  /products` · `GET /products/{id}`
- ⬜ `GET  /products/{id}/bom` `?version=` — flattened BOM (default: Active)
- ⬜ `GET  /products/{id}/versions` · `POST /products/{id}/versions`

### PCBs
- ⬜ `GET  /pcbs` · `GET /pcbs/{id}` · `GET /pcbs/{id}/bom`
- ⬜ `GET  /pcbs/{id}/revisions` · `POST /pcbs/{id}/revisions`

### Components
- ⬜ `GET  /components` `?category&solderType&brand&supplier&stockStatus&footprint&q`
- ⬜ `GET  /components/{id}` · `GET /components/{id}/usage`
- ⬜ `GET  /components/{id}/stock` — rolled-up {available, reserved, damaged, onHand, byWarehouse[]}
- ⬜ `POST /components` · `POST /components/{id}/prices`
- ⬜ `GET  /components/{id}/prices` `?asOf=` — price book (default: current)

### Brands & Suppliers
- ⬜ `GET  /brands` · `GET /brands/{id}` · `GET /brands/{id}/components`
- ⬜ `GET  /suppliers` · `GET /suppliers/{id}` · `GET /suppliers/{id}/prices`

### Dashboard & Reports
- ⬜ `GET  /dashboard/summary` — KPIs, low-stock, single-supplier, product status
- ⬜ `GET  /reports/yield` `?range=6m`

### Inventory (append-only ledger — never write stock directly, §7a)
- ⬜ `GET  /warehouses` · `GET /warehouses/{id}`
- ⬜ `GET  /warehouses/{id}/locations` — Zone→Rack→Bin tree
- ⬜ `POST /locations` · `PATCH /locations/{id}`
- ⬜ `GET  /inventory` `?componentId&variantId&warehouseId&locationId` — balances (projection)
- ⬜ `POST /inventory/transactions` — IN|OUT|TRANSFER|ADJUSTMENT|RETURN|CONSUMPTION|PRODUCTION
- ⬜ `GET  /inventory/transactions` `?variantId&warehouseId&locationId&type&from&to`

### Production (order lifecycle, §7b)
- ⬜ `POST /production-orders` · `PATCH /production-orders/{id}`
- ⬜ `GET  /production-orders/{id}/items` — STAGE 1 plan (BOM demand)
- ⬜ `POST /production-orders/{id}/allocations` — STAGE 2 reserve
- ⬜ `POST /production-orders/{id}/consumptions` — STAGE 3 issue
- ⬜ `POST /production-orders/{id}/complete` — STAGE 4 finished-goods receipt + close

### Purchasing (PR/PO header + items, approvals, §7c)
- ⬜ `POST /purchase-requests` · `PATCH /purchase-requests/{id}`
- ⬜ `POST /purchase-requests/{id}/items`
- ⬜ `POST /purchase-requests/{id}/submit` — Draft → Submitted
- ⬜ `POST /purchase-requests/{id}/decision` — manager/procurement approve/reject (writes `approvals`)
- ⬜ `POST /purchase-requests/{id}/approve` — sources into PO(s), one per supplier
- ⬜ `POST /purchase-orders` · `PATCH /purchase-orders/{id}`
- ⬜ `POST /purchase-orders/{id}/items`
- ⬜ `POST /purchase-orders/{id}/receipts` — goods-in → inventory_transactions(type='IN')

### Audit, approvals & notifications
- ⬜ `GET  /audit-logs` `?entity&entityId&field&changedBy&from&to`
- ⬜ `GET  /approvals` `?entityType&entityId`
- ⬜ `GET  /notifications` `?unread=true`
- ⬜ `POST /notifications/{id}/read` · `POST /notifications/read-all`

---

## Implemented endpoints (detail)

_None yet. As each endpoint above moves to 🟡/✅, add its full template entry in this section._
