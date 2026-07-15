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

_Last updated: 2026-07-15 — added an **edge session gate** ([src/proxy.ts](../src/proxy.ts), Next 16 Proxy):
unauthenticated `/api/*` (except login/logout) → 401, unauthenticated pages (except `/login`) → redirect to
`/login`, as defense-in-depth over the existing DAL guards. Earlier: catalog **write** endpoints live: `POST /brands`, `PATCH /brands/{id}`, `POST /suppliers`, `PATCH /suppliers/{id}`, `POST /suppliers/{id}/prices` (price-book upsert), `PATCH /components/{id}`, `POST /components/{id}/variants`, `DELETE /components/{id}` (soft-delete, 409 if used in a BOM). The Brands, Supplier-Details and Component-Details pages persist through these instead of localStorage (localStorage fully removed from all three); Component-Details Add-Supplier auto-creates an unknown supplier/brand then prices it. Remaining session-only bits: brands/list brand↔supplier "map" (no schema link — a price needs a component) and "set preferred supplier" (no column)._

## Frontend integration (UI → backend)

The UI consumes the backend exclusively via a **global data provider** — the app is **DB-only**
(the `isTesting` mock mode and `src/mockdata` have been removed).

- **Selector factory** — [src/lib/catalog/selectors.ts](../src/lib/catalog/selectors.ts)
  `createSelectors(dataset)` holds ALL derivations (pcbBom, productBom, cheapestOffer, componentUsage,
  …); the provider binds it to the live `/api/bootstrap` payload. Shared entity types live in
  [src/lib/catalog/types.ts](../src/lib/catalog/types.ts).
- **`GET /api/bootstrap`** returns the whole catalog in the exact `DataSet` shape (business-key
  id-space: slug / generic_pn; live stock folded into brand variants).
- **`DataProvider` / `useData()`** — [src/lib/data-provider.tsx](../src/lib/data-provider.tsx): on mount
  calls `/api/me`; a 401 leaves it `unauthenticated` (no auto dev-login) and [`AppShell`](../src/components/app-shell.tsx)
  redirects to `/login`. When authenticated it loads `/api/bootstrap`, binds the factory, and exposes all
  selectors + `me` (incl. `is_superadmin`) + `can(permission)` + `authState` + `logout()`. Gates render until loaded.
- **Login** — [`/login`](../src/app/login/page.tsx) posts `/api/auth/login` (email + password); the top-bar
  account menu calls `logout()` → `/api/auth/logout`. There is no credential-free / demo login path.
- **Migration pattern per page:** replace `import … from "@/mockdata"` with `const d = useData()`, and
  move any module-scope view-model build into the component (a `useMemo`). Pages then behave the same.
- **Status:** ✅ Components List, Products List/Structure, PCB List/Structure, Suppliers List/Details,
  Brands List, Component Details/Usage, **Universal Search** (via `buildSearchData(useData())`).
  `DataProvider` now wraps the whole shell (so the TopBar/search use it); `DataGate` gates only `<main>`.
  ✅ Dashboard (all panels via `GET /api/dashboard`) + Home Launchpad (`buildWorkspaceStats` over live
  selectors) + Production Planner/Readiness (via `GET /api/production/readiness` — product+qty driven).
  ✅ **Inventory** (`/components/inventory`) — now reads/writes the REAL ledger: `useStockLedger` is
  backed by `GET /api/inventory` (balances → variant/location resolution) + `GET /api/inventory/transactions`,
  and stock moves `POST /api/inventory/transactions` (verified: a move updates the projected balance and
  the page reflects it). Keyed on `genericPN`+brand slug so it works in both modes; mock mode is read-only
  (moves return 400). `LedgerView` gained `brandSlug`.
  ✅ **Purchases** (`/purchases/requests`, `/purchases/orders`) — lists from GET, create/approve/receive
  POST the API; localStorage removed. Readiness + Planner PR-creation also POST `/api/purchase-requests`.
  The requests screen's active shortage + sourcing come from `GET /api/purchases/recommendations`.
  ✅ **Production Orders** (`/production/orders`) — kanban reads `GET /production-orders`; dragging a card
  to the next lane advances the batch via the lifecycle endpoints (Draft→Ready = allocate, Ready→In
  Progress = consume, In Progress→Complete = complete); non-adjacent moves are rejected with a toast.
  "New Order" POSTs `/production-orders` (product from `useData().PRODUCTS`); clicking a card opens the
  material-plan modal (`GET /production-orders/{id}/items`). Verified end-to-end on the DB.
  ✅ **Component Add** (`/components/add`) — the form POSTs `/api/components` (brand variants + opening
  stock); duplicate generic PN → 409 surfaced as a toast, success routes back to the list.
  ✅ **Reports** (`/reports`) — the Monthly Production Output chart loads `GET /reports/yield?range=6m`
  (falls back to the static series if the fetch fails). Distribution/KPI tiles remain presentational.
  (localStorage demo writes on Brands/Supplier/Component Details left intact — real write endpoints later.)
- **Auth note:** the only way to establish a session is `POST /api/auth/login` with valid credentials.
  (The former dev-only `dev-login` bypass was removed for privacy — it granted a superadmin session with no password.)

---

## Conventions (cross-cutting — read once)

These apply to **every** endpoint unless its entry says otherwise. Documented here so per-endpoint
entries stay short.

### Data access — DB-only (mock mode removed)
- The app always uses PostgreSQL (real auth + RLS). The former `isTesting` full-mock mode, the
  `src/mockdata` datasets, and `src/lib/server/mock.ts` have been removed. `DATABASE_URL` + `AUTH_SECRET`
  are required.
- **Pattern:** each resource's queries live in a **data provider** under `src/lib/server/data/*`
  (e.g. `listComponents()` in [components.ts](../src/lib/server/data/components.ts)), so route handlers
  stay thin. Every new data endpoint MUST go through a provider, not query inline in the route.
- **Demo seed data** now lives outside the app as dev-only fixtures in
  [scripts/seed-data/](../scripts/seed-data/), consumed only by the `scripts/seed-*.ts` seeders.

### Tenancy & RLS — non-negotiable
- The active company/user come from the **session**, never from the URL/query/body. No endpoint
  takes a `companyId`. (See [`ARCHITECTURE.md §7f`](ARCHITECTURE.md).)
- **All tenant-scoped DB work goes through `withTenant(ctx, fn)`** ([src/lib/prisma.ts](../src/lib/prisma.ts)),
  which opens a transaction and sets `app.current_company_id` / `app.current_user_id`. A bare
  `prisma.*` call outside it runs with no tenant context and **returns 0 rows** (RLS default) —
  that is the safe failure mode, not a bug.
- The runtime connects as `erp_app` (NOBYPASSRLS). It **cannot** write `audit_logs` (trigger-only)
  or mutate `inventory_transactions` (append-only). Corrections are reversing entries.

### AuthN — JWT in an httpOnly cookie
- Login (`POST /api/auth/login`) verifies the password (Node `scrypt`, [src/lib/server/auth.ts](../src/lib/server/auth.ts)),
  resolves the user's default/first active company, and issues a **jose HS256 JWT** carrying
  `{ sub: userId, company: companyId }`. It's stored in the **`erp_session`** cookie
  (httpOnly, SameSite=Lax, 7d, `secure` in prod). Signed with `AUTH_SECRET` (`.env`).
- Protected routes call **`requireSession()`** ([src/lib/server/session.ts](../src/lib/server/session.ts))
  → reads + verifies the cookie → returns `{ userId, companyId }` (the `withTenant` context) or throws 401.
- Switching the active company (`POST /api/session/company`) re-issues the cookie; the token is
  the single source of the active company. No `companyId` ever comes from the URL/body of data routes.
- Before an active company exists (login / switch), use **`withUser(userId, fn)`** — sets only
  `app.current_user_id` so RLS lets the user read their own memberships.
- **Edge session gate (defense in depth):** [src/proxy.ts](../src/proxy.ts) (Next 16 renamed
  `middleware`→`proxy`) verifies the `erp_session` cookie (signature + expiry via jose, **no DB**)
  on every request except Next internals/static assets. Unauthenticated → `/api/*` gets a **401**
  in the standard envelope (except public `/api/auth/login` + `/api/auth/logout`); a **page** gets a
  **307 redirect to `/login`** (except `/login` itself). This is NOT the primary defense — per-route
  `requireSession`/`withTenant`(RLS)/`assertPermission` at the DAL still enforce authN, tenant
  scoping and RBAC. The gate only guarantees no unauthenticated request (incl. to a route that
  forgot its guard, or a non-existent `/api/*` path) reaches application code, and turns signed-out
  page visits around at the edge (no protected-shell flash). Tenancy/permissions stay at the DAL.

### AuthZ — `resource.action` gate
- Each mutating/reading data route asserts a permission via **`assertPermission(tx, ctx, "component.view")`**
  ([src/lib/server/rbac.ts](../src/lib/server/rbac.ts)), run **inside** `withTenant` so RLS scopes the lookup.
- Effective permissions = the grants on the role pinned by `company_memberships.role_id`
  (`getEffectivePermissions`). Matrix constant lives in [src/lib/permissions.ts](../src/lib/permissions.ts) (§7h).
- Stacks with module licensing (§4): a module must be licensed **and** the role must permit the action.
  _(Module-license enforcement on the server is still TODO — currently only the permission check runs.)_

### Request validation — zod
- Every body/query is parsed with a **zod** schema. Bodies: `await parseJson(req, Schema)`
  ([src/lib/server/http.ts](../src/lib/server/http.ts)). Query: build an object from
  `new URL(req.url).searchParams` and `Schema.parse(...)`. A `ZodError` is auto-translated to **422**.

### Response & error shape
- Handlers wrap their body in **`handle(fn)`**. Success: **`ok(data, init?)`** / **`created(data)`** →
  `{ "data": ... }`. Errors: throw an **`ApiError`** (use the `Errors.*` constructors) →
  `{ "error": { code, message, details? } }` with the right status. `ZodError` → 422
  `validation_error`; anything unexpected → 500 `internal_error` (logged, not leaked).
- Status/code map: 400 `bad_request` · 401 `unauthorized` · 403 `forbidden` · 404 `not_found`
  · 409 `conflict` · 422 `unprocessable`/`validation_error` · 500 `internal_error`.
- Every DB route sets `export const runtime = "nodejs"` and `export const dynamic = "force-dynamic"`
  (Prisma/pg need Node; auth reads cookies so routes are request-time anyway).

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
- ✅ `POST /auth/login` — verify credentials, issue session cookie, return user + active company
- ✅ `POST /auth/logout` — clear the session cookie (added; not in original §7 list)
- ✅ `GET  /bootstrap` — whole catalog as a `DataSet` for the frontend data provider
- ✅ `GET  /me/companies` — companies this user can access
- ✅ `POST /session/company` — switch active company (re-issues cookie)
- ✅ `GET  /me` — current user (incl. `is_superadmin`) + active company + effective permissions
- ✅ `POST /me/password` — self-service password change (verifies current password; any authenticated user)

### RBAC admin
- ✅ `GET  /permissions` — the resource × action matrix (static app constant, §7h)
- ⬜ `GET  /roles` · `GET /roles/{id}`
- ⬜ `POST /roles` · `PATCH /roles/{id}` · `DELETE /roles/{id}`
- ⬜ `PUT  /roles/{id}/permissions` — set granted (resource, action) pairs
- ⬜ `GET  /users` `?q` — members of the active company
- ⬜ `PUT  /memberships/{id}/role` — set a user's role in the active company

### Superadmin (cross-tenant governance — `users.is_superadmin`)
All routes are superadmin-only (403 otherwise) and run cross-tenant via `withSuperadmin`
(user GUC only + the `superadmin_all` RLS policies). Backs the `/superadmin` console.
- ✅ `GET   /superadmin/overview` — users, companies, roles (+grants), permission matrix, module ids
- ✅ `POST  /superadmin/users` · `PATCH /superadmin/users/{id}` — create / edit a global user (PATCH also resets password: `{ password }`, no current-password check)
- ✅ `POST  /superadmin/users/{id}/memberships` — add user to a company (+ optional role)
- ✅ `PATCH /superadmin/memberships/{id}` · `DELETE /superadmin/memberships/{id}` — role/status/default; remove
- ✅ `POST  /superadmin/companies` (seeds an Admin role) · `PATCH /superadmin/companies/{id}`
- ✅ `PUT   /superadmin/companies/{id}/modules` — toggle one module for that company
- ✅ `POST  /superadmin/roles` · `PATCH /superadmin/roles/{id}` · `DELETE /superadmin/roles/{id}`
- ✅ `PUT   /superadmin/roles/{id}/permissions` — replace a role's grants

### Products
- ✅ `GET  /products` · ✅ `GET /products/{id}` (detail: counts + board list)
- ✅ `GET  /products/{id}/bom` — flattened BOM (Active version). `?version=` param not yet supported
- ⬜ `GET  /products/{id}/versions` · `POST /products/{id}/versions`

### PCBs
- ✅ `GET  /pcbs` · ✅ `GET /pcbs/{id}` · ✅ `GET /pcbs/{id}/bom`
- ⬜ `GET  /pcbs/{id}/revisions` · `POST /pcbs/{id}/revisions`

### Components
- 🟡 `GET  /components` `?category&solderType&footprint&q` — done, now incl. derived `stock`/`available`/`reserved`/`stockStatus`; `brand`/`supplier`/`stockStatus` *filters* still deferred
- ⬜ `GET  /components/{id}` · `GET /components/{id}/usage`
- ✅ `PATCH /components/{id}` — edit own fields (name/genericPN/category/unit/solderType/footprint/spq/minStock/reorderQty/specs)
- ✅ `DELETE /components/{id}` — soft-delete (`component.delete`); 409 if referenced by any active PCB BOM line
- ✅ `POST /components/{id}/variants` — add a brand variant (+ optional opening stock)
- ✅ `GET  /components/{id}/stock` — rolled-up {onHand, reserved, available, damaged, byWarehouse[], byVariant[]}
- ✅ `POST /components` — create component + brand variants (+ opening stock via IN ledger) · ⬜ `POST /components/{id}/prices`
- ⬜ `GET  /components/{id}/prices` `?asOf=` — price book (default: current)

### Brands & Suppliers
- ✅ `GET  /brands` · ✅ `GET /brands/{id}` · ✅ `GET /brands/{id}/components`
- ✅ `POST /brands` — create (`brand.create`; slug from name) · ✅ `PATCH /brands/{id}` — edit own fields (`brand.edit`; slug immutable)
- ✅ `GET  /suppliers` · ✅ `GET /suppliers/{id}` · ✅ `GET /suppliers/{id}/prices`
- ✅ `POST /suppliers` — create (`supplier.create`; slug from name) · ✅ `PATCH /suppliers/{id}` — edit own fields (`supplier.edit`; slug immutable)
- ✅ `POST /suppliers/{id}/prices` — upsert current price for a (component, brand) (`supplier.edit`)

### Dashboard & Reports
- ⬜ `GET  /dashboard/summary` — KPIs, low-stock, single-supplier, product status
- ✅ `GET  /reports/yield` `?range=6m` — monthly finished-batch output (Σ Completed-order qty, zero-filled)

### Inventory (append-only ledger — never write stock directly, §7a)
- ✅ `GET  /warehouses` — list (`GET /warehouses/{id}` detail still ⬜)
- ✅ `GET  /warehouses/{id}/locations` — Zone→Rack→Bin tree (by uuid or code)
- ⬜ `POST /locations` · `PATCH /locations/{id}`
- ✅ `GET  /inventory` `?componentId&variantId&warehouseId&locationId` — balances (projection)
- ✅ `POST /inventory/transactions` — IN|OUT|TRANSFER|ADJUSTMENT|RETURN|CONSUMPTION|PRODUCTION
- ✅ `GET  /inventory/transactions` `?variantId&warehouseId&locationId&type&from&to&limit`

### Production (order lifecycle, §7b)
- ✅ `GET  /production-orders` — kanban list (one row per order) · ✅ `POST /production-orders` — STAGE 1 create + BOM explode
- ✅ `GET  /production-orders/{id}/items` — STAGE 1 plan (BOM demand + derived allocated/consumed/available)
- ✅ `POST /production-orders/{id}/allocations` — STAGE 2 reserve (atomic; 409 + shorts if insufficient)
- ✅ `POST /production-orders/{id}/consumptions` — STAGE 3 issue (CONSUMPTION ledger + release reservation)
- ✅ `POST /production-orders/{id}/complete` — STAGE 4 close batch (finished-goods stock not modelled — see detail)
- ⬜ `PATCH /production-orders/{id}` — header edits / cancel

### Purchasing (PR/PO header + items, approvals, §7c)
- ✅ `GET  /purchase-requests` — flattened rows (one per item; UI status mapping)
- ✅ `POST /purchase-requests` — create (Submitted) w/ one line, priced from the price book
- ✅ `POST /purchase-requests/{id}/approve` — records manager+procurement `approvals`, PR → 'PO Created', creates PO (Sent). (Single-click chain; separate `/submit`+`/decision` steps deferred)
- ✅ `GET  /purchase-orders` — flattened rows with PR traceability
- ✅ `POST /purchase-orders/{id}/receive` — goods-in → inventory `IN` ledger rows + received_qty + PO Completed
- ⬜ `PATCH` header edits · multi-item `POST .../items` · reject flow · PO split per supplier

### Audit, approvals & notifications
- ⬜ `GET  /audit-logs` `?entity&entityId&field&changedBy&from&to`
- ⬜ `GET  /approvals` `?entityType&entityId`
- ⬜ `GET  /notifications` `?unread=true`
- ⬜ `POST /notifications/{id}/read` · `POST /notifications/read-all`

---

## Implemented endpoints (detail)

### POST /api/auth/login — ✅
- **Source:** [src/app/api/auth/login/route.ts](../src/app/api/auth/login/route.ts)
- **Permission:** public.
- **Purpose:** authenticate and start a session.
- **Request:** body `{ email: string(email), password: string }` (zod `LoginBody`).
- **Logic:**
  1. `parseJson` → validate body.
  2. Look up `users` by case-insensitive email (users is GLOBAL — no tenant context needed).
  3. `verifyPassword` (scrypt, constant-time). Unknown user / inactive / bad password → **401**
     with one generic message (no account enumeration).
  4. `withUser(userId)` → find the `is_default active` membership, else the oldest active one;
     load that company. None → **403** "No active company membership".
  5. `setSessionCookie({ userId, companyId })` (signs JWT, sets `erp_session`).
- **DB access:** `users` (read, global); inside `withUser` tx: `company_memberships`, `companies` (read).
- **Side effects:** sets the `erp_session` cookie.
- **Returns:** 200 `{ user:{id,name,email}, company:{id,code,name} }`. Errors: 401, 403, 422.
- **Notes:** password set via `scripts/seed-admin.ts` (admin@stackiot.local / ChangeMe123!).

### POST /api/auth/logout — ✅
- **Source:** [src/app/api/auth/logout/route.ts](../src/app/api/auth/logout/route.ts)
- **Permission:** session only (idempotent even without one).
- **Logic:** `clearSessionCookie()`. **Returns:** 200 `{ ok: true }`.

### GET /api/me — ✅
- **Source:** [src/app/api/me/route.ts](../src/app/api/me/route.ts)
- **Permission:** session only.
- **Logic:** `requireSession` → read `users` (global) → `withTenant`: load active `companies` row +
  `getEffectivePermissions`. Company not visible → **403**.
- **DB access:** `users` (read); tx: `companies`, `company_memberships`, `role_permissions` (read).
- **Returns:** 200 `{ user, company, permissions: string[] }` (sorted `resource.action`). Errors: 401, 403.

### GET /api/me/companies — ✅
- **Source:** [src/app/api/me/companies/route.ts](../src/app/api/me/companies/route.ts)
- **Permission:** session only.
- **Logic:** `requireSession` → `withUser`: list the user's own `company_memberships`, join to
  `companies`; flag `isDefault`, `status`, and `isActive` (== session company).
- **DB access:** tx: `company_memberships`, `companies` (read). **Returns:** 200 `{ data: Company[] }`.

### POST /api/session/company — ✅
- **Source:** [src/app/api/session/company/route.ts](../src/app/api/session/company/route.ts)
- **Permission:** session only.
- **Request:** body `{ companyId: uuid }`.
- **Logic:** `requireSession` → `withUser`: verify an active membership in the target company (else
  **403**) → re-issue `erp_session` with the new company. **Returns:** 200 `{ company }`.

### GET /api/permissions — ✅
- **Source:** [src/app/api/permissions/route.ts](../src/app/api/permissions/route.ts)
- **Permission:** session only.
- **Logic:** `requireSession` → return the static matrix (no DB). Describes what CAN be granted,
  not what the caller HAS (that's `GET /me`).
- **Returns:** 200 `{ matrix: Record<resource, action[]>, all: string[] }`.

### GET /api/components — 🟡
- **Source:** [src/app/api/components/route.ts](../src/app/api/components/route.ts)
- **Permission:** `component.view`.
- **Request:** query `category`, `solderType`(`SMD|DIP`), `footprint`, `q` (all optional, zod-validated).
- **Logic:** `requireSession` → build a Prisma `where` (`deleted_at: null` + exact filters; `q` →
  case-insensitive `contains` across generic_pn/name/description) → `withTenant`:
  `assertPermission("component.view")` then `components.findMany` ordered by name.
- **DB access:** tx: `components` (read), plus `company_memberships`/`role_permissions` for the gate.
- **Returns:** 200 `{ data: ComponentView[] }` — camelCase (`genericPN`, `minStock`, …) matching
  `src/mockdata/types.ts`; `Decimal` → `Number`.
- **Derived stock (done):** the list rolls up `inventory_balances` over each component's brand
  variants (one grouped query, merged in JS) → `stock` (on-hand), `available`, `reserved`, and
  `stockStatus` (Healthy/Low/Critical vs `minStock`). Mock mode uses the mockdata derived stock.
- **TODO:** `brand`/`supplier`/`stockStatus` **filters** on the list (join variants + price book /
  filter post-rollup).

### Brands — ✅ (`/brands`, `/brands/{id}`, `/brands/{id}/components`)
- **Source:** [route](../src/app/api/brands/) · provider [src/lib/server/data/brands.ts](../src/lib/server/data/brands.ts)
- **Permission (DB mode):** `brand.view`.
- **Logic:** list/detail from `brands`; `{id}` accepts a **uuid or slug** (`isUuid()` picks the column).
  `/components` = distinct components with a variant for the brand (raw SQL join `component_brand_variants`).
- **Returns:** `BrandView` (`id, slug, name, description, headquarter, founded, status, rating`);
  components as `{ id, genericPN, name, category }`.

### Suppliers — ✅ (`/suppliers`, `/suppliers/{id}`, `/suppliers/{id}/prices`)
- **Source:** [route](../src/app/api/suppliers/) · provider [src/lib/server/data/suppliers.ts](../src/lib/server/data/suppliers.ts)
- **Permission (DB mode):** `supplier.view`. `{id}` = uuid or slug.
- **Logic:** `/prices` returns the **current** price book (`supplier_component_prices` where `valid_to IS NULL`),
  joined to component + brand. Mock mode derives the same from `COMPONENTS[].offers`.
- **Returns:** `SupplierView`; prices as `{ componentId, genericPN, componentName, brandId, brandName, price, currency, leadTimeDays }`.

### PCBs — ✅ (`/pcbs`, `/pcbs/{id}`, `/pcbs/{id}/bom`)
- **Source:** [route](../src/app/api/pcbs/) · provider [src/lib/server/data/pcbs.ts](../src/lib/server/data/pcbs.ts)
- **Permission (DB mode):** `pcb.view`. `{id}` = uuid or slug.
- **Logic:** DB mode resolves through the **Active `pcb_revision`** (§7d). List/detail aggregate
  `lineCount`, `totalParts` (Σ qty), and `usedInProducts` (product codes, via `product_pcbs`). BOM =
  lines joined to components + preferred brand. Composable SQL via `Prisma.sql`/`Prisma.empty`.
- **Returns:** `PcbView` (+ `lineCount, totalParts, usedInProducts[]`); BOM lines as
  `{ component:{id,genericPN,name,category,unit}, qty, refDes, preferredBrand:{id,name}|null, remarks }`.
- **`POST /pcbs`** (`pcb.create`): create a **standalone** PCB from a BOM —
  body `{ name, description?, layers?, status?, lines:[{ componentId?, name?, partNumber?, type?, solderType?, footprint?, qty }] }`.
  Creates a `pcbs` row + Active `pcb_revision` (`Rev A`) + a `pcb_line` per component (qty aggregated per
  component). Each line links an existing component by `generic_pn` or creates one on the fly (shared
  `resolveOrCreateComponent`/`uniqueSlug` in `data/util.ts`). Returns the created `PcbView`.

### Products — ✅ (`/products`, `/products/{id}`, `/products/{id}/bom`)
- **Source:** [route](../src/app/api/products/) · provider [src/lib/server/data/products.ts](../src/lib/server/data/products.ts)
- **Permission (DB mode):** `product.view`. `{id}` = uuid, slug, or code.
- **Logic:** DB mode resolves the **current BOM**: Active `bom_version` → `product_pcbs` → pinned
  `pcb_revision` → `pcb_lines`. List has `pcbCount`, `uniqueComponentsCount`; detail adds `totalParts`,
  `brandCount`, and the `pcbs[]` board list (qty/sequence). BOM is flattened with
  **qty = pcb_line.qty × product_pcbs.qty**.
- **Returns:** `ProductView` / `ProductDetailView`; BOM lines as `{ pcb:{id,name}, component:{id,genericPN,name}, qty }`.
- **`POST /products`** (`product.create`): create a **catalog** product from a set of PCBs —
  body `{ name, code?, description?, versionLabel?, status?, pcbs:[{ name?, qty?, lines:[{ componentId?, name?, partNumber?, type?, solderType?, footprint?, qty }] }] }`.
  Each PCB becomes a `pcbs` row + Active `pcb_revision` (`Rev A`) + `pcb_lines`, linked via an Active
  `bom_version` → `product_pcbs` (with the board's `qty` per unit + sequence). Each line links an existing
  component (`componentId` = generic_pn) or is **created on the fly** (deduped by generic_pn). A flat
  `lines:[…]` body is still accepted and wrapped into a single auto **"<name> Main Board"**. This is the
  "Add Manually" path — it lands in the catalog graph (not `custom_products`), so it feeds the dashboard.
  Returns the created `ProductView`.
- **TODO:** `?version=` selector; derived `buildableQty`/`estimatedCost`-from-BOM (needs inventory + best price).

> **Shared pattern for the four above:** each provider exposes plain async functions that branch on
> `isTesting` (mock = `src/mockdata` + selectors; DB = `withTenant` + `assertPermission` + queries).
> Detail lookups accept a uuid **or** business key (slug/code). Aggregates/joins use raw SQL with
> numeric casts (`::int`/`::float8`) so JS receives numbers, not `Decimal`/strings.

### Custom (user-added) products — ✅ (`/custom-products`, `/{id}`, `/{id}/versions`, `/{id}/versions/{versionId}`)
- **Source:** [route](../src/app/api/custom-products/) · provider [custom-products.ts](../src/lib/server/data/custom-products.ts).
- **Why separate:** products added via **Import BOM** / **Add Manually** have arbitrary free-text BOM
  lines (raw MPN/manufacturer/qty), NOT registered catalog components, so they can't live in the
  `products → bom_versions → pcb_lines → components` graph. They persist in dedicated tables
  `custom_products` + `custom_bom_versions` (raw lines as JSONB); one product holds MANY versions.
- **Endpoints / permissions:** `GET` list + `POST` create (`product.view` / `product.create`);
  `PATCH {id}` set active version (`product.edit`); `DELETE {id}` soft-delete product+versions
  (`product.delete`); `POST {id}/versions` add+activate a version (`product.create`);
  `DELETE {id}/versions/{versionId}` soft-delete a version, refuses the last one (`product.edit`).
- **id-space:** client id is `cp-<slug>` (so the UI distinguishes custom from catalog products);
  `{id}` accepts `cp-<slug>`, a bare slug, or the uuid. Create derives a unique slug per tenant.
- **Returns:** `CustomProductView` (`{ id, name, code, description, source, versions[], activeVersionId,
  createdAt }`) — the same shape the client `useUserProducts` context consumes. Mock mode (isTesting):
  list = `[]`, writes = **400 `mock_read_only`**.
- **Replaces** the old localStorage store (`erp:user-products`) — now server-persisted + multi-tenant.

### Purchasing — ✅ (PR list/create/approve, PO list/receive)
- **Source:** routes under [purchase-requests](../src/app/api/purchase-requests/) +
  [purchase-orders](../src/app/api/purchase-orders/) · provider [purchases.ts](../src/lib/server/data/purchases.ts).
- **Permissions:** `purchase_request.view/create/approve`; receive = `purchase_order.edit` **+** `inventory.create`.
- **Views are FLATTENED** (one row per item, business keys: pr_no/po_no, genericPN, slugs; `totalCost`
  formatted ₹) to match the UI/mock shape; storage is normalized header+items. DB `pr_status` → UI:
  Submitted/Manager Approved → "Pending Approval", Procurement Approved/PO Created → "Approved".
- **Create PR:** resolves component (generic_pn) / brand / supplier (slugs), prices the line from the
  current price-book row, `purchase_requests`(Submitted) + one `purchase_request_items`. Doc numbers:
  `PR-`/`PO-` + random 6 digits w/ uniqueness retry.
- **Approve PR:** guards status (Submitted|Manager Approved else **409**), writes BOTH `approvals`
  steps (manager, procurement — seq 1/2, Approved), PR → 'PO Created', creates `purchase_orders`(Sent)
  + `purchase_order_items` with `pr_item_id` traceability. Returns `{pr, po}`.
- **Receive PO:** for each unreceived line resolves the `component_brand_variants` row, appends
  `inventory_transactions(type='IN', ref_type='purchase_order_item', ref_id=line, reason='Goods-in <po>')`
  into the default bin (trigger projects balances), sets `received_qty`, PO → Completed. Re-receive → **409**.
- **Verified end-to-end:** create → ₹-priced PR → approve → PO → receive → RES-10K/yageo balance +500
  and the IN ledger row present; double-receive 409.
- **Seeding:** `npx tsx scripts/seed-purchases.ts` (mock PRs/POs; Completed POs get received_qty but NO
  ledger rows — opening stock already covers levels). Idempotent by pr_no/po_no.
- **Recommendations** (`GET /purchases/recommendations?component=<pn|slug|uuid>`): supplier sourcing
  options for a component; `component` omitted → auto-picks the biggest current BOM shortage (per-unit
  demand vs available) with a `suggestedQty`. Powers the PR screen's active-shortage panel. Provider
  `getRecommendations` in [purchases.ts](../src/lib/server/data/purchases.ts); permission `purchase_request.view`.

### Inventory ledger — ✅ (warehouses, balances, ledger GET/POST, component stock)
- **Source:** routes under [warehouses](../src/app/api/warehouses/), [inventory](../src/app/api/inventory/),
  [components/[id]/stock](../src/app/api/components/[id]/stock/) · providers
  [warehouses.ts](../src/lib/server/data/warehouses.ts) + [inventory.ts](../src/lib/server/data/inventory.ts).
- **Permissions (DB):** reads `inventory.view` / `warehouse.view`; **`POST` requires `inventory.create`**.
- **Golden rule:** stock is NEVER written directly. `POST /inventory/transactions` appends immutable
  `inventory_transactions` rows and the DB trigger `apply_inventory_txn` projects them into
  `inventory_balances`. Reads (`GET /inventory`, `/components/{id}/stock`) are projections.
- **`POST` body** (validated by `InventoryTxnBody`, zod `superRefine`):
  - `IN | RETURN | PRODUCTION` → `{ variantId, locationId, qty>0, reason?, note?, refType?, refId?, grnNo? }` (qty_delta = +qty)
  - `OUT | CONSUMPTION` → same shape (qty_delta = −qty)
  - `ADJUSTMENT` → `{ variantId, locationId, qtyDelta≠0, reason?, note? }` (signed)
  - `TRANSFER` → `{ variantId, fromLocationId, toLocationId, qty>0, note? }` → **two legs** sharing a
    `transfer_group_id` (−qty at source, +qty at dest). `warehouse_id` is derived from the location.
  - Negative movements check available stock first → **409 `conflict`** if insufficient.
- **Returns (POST):** 201 `{ ok, type, balances[] }` (post-trigger projection for the affected variant/locations).
- **Reads:** `GET /inventory` (balances, filters); `GET /inventory/transactions` (ledger, filters + `limit`,
  newest-first); `GET /components/{id}/stock` (rolled-up onHand/reserved/available/damaged + byWarehouse/byVariant).
- **Mock mode:** reads derive from `src/mockdata` (client-ledger prototype) with a synthetic MAIN
  warehouse/bin; **writes are rejected 400 `mock_read_only`**.
- **Seeding:** `npx tsx scripts/seed-inventory.ts` creates the MAIN warehouse + default bin and one
  opening IN per brand variant (from mock stock levels). Idempotent.
- **TODO:** `POST/PATCH /locations` (location CRUD), `GET /warehouses/{id}` detail, finished-goods
  flows (PRODUCTION receipts), and wiring derived `stock`/`stockStatus` into the component list view.

### Production lifecycle — ✅ (list, create/explode, items, allocate, consume, complete)
- **Source:** routes under [production-orders](../src/app/api/production-orders/) · provider
  [production.ts](../src/lib/server/data/production.ts).
- **Permissions (DB):** reads `production_order.view`; create `production_order.create`; allocate/consume/complete
  `production_order.edit`; **consume also requires `inventory.create`** (it writes the ledger).
- **Doc numbers:** `MO-` + random 6 digits (uniqueness retry) — deliberately distinct from purchasing's `PO-`.
- **Views are FLATTENED** to match the kanban/mock shape: order `{ id: order_no, product, qty, status, targetDate }`
  with `status` via `::text` so 'In Progress' keeps its space (Prisma's enum ident is `In_Progress`).
- **STAGE 1 create** (`POST /production-orders` `{ product(uuid|slug|code), qty>0, targetDate? }`): resolves the
  product's **Active `bom_version`** (snapshotted onto the order), explodes demand per component
  (`Σ pcb_line.qty × product_pcbs.qty × order.qty`) into `production_order_items(status='pending')`. Order → Draft.
- **STAGE 2 allocate** (`.../allocations`): guards status Draft. **Pre-checks availability for EVERY pending
  item first** (Σ `inventory_balances.available` across the component's variants); if ANY is short → **409
  `conflict` `{ shorts:[{componentId,required,available}] }`** and nothing is reserved. Otherwise greedily
  reserves per item across bins (available desc) as `production_material_moves(kind='allocation')` — the
  `apply_allocation` trigger bumps `inventory_balances.reserved`. Items → allocated, order → Ready.
- **STAGE 3 consume** (`.../consumptions`): guards status Ready. For each open allocation: appends
  `inventory_transactions(type='CONSUMPTION', qty_delta=−qty, ref_type='production_order', ref_id=order)`
  (on_hand −qty), records a `kind='consumption'` move, and sets the allocation's `released_at` (trigger frees
  the reservation so it isn't double-counted). Net: on_hand −qty, reserved −qty. Items → consumed, order → In Progress.
- **STAGE 4 complete** (`.../complete`): guards status In Progress → sets order Completed. **Finished-goods stock
  for the *product* is NOT modelled** — the ledger is keyed on component brand variants and a product isn't a
  component; the consumed parts are already off the ledger, so completing just closes the batch.
- **Items** (`GET /production-orders/{id}/items`): STAGE-1 plan per component with derived `allocated` (open
  reservations), `consumed`, and `available` (free stock across variants), and `status`.
- **Verified end-to-end (DB):** create ROIP/Dispatcher batch → 21-line plan → allocate (reserved bumped,
  available dropped, order Ready) → consume (on_hand −qty, reservation released, CONSUMPTION rows tagged
  `production_order`, order In Progress) → complete. Guards: re-complete 409; oversized batch → allocate 409
  with the shortage list (atomic, nothing reserved). All verification data was reversed/removed afterwards.
- **TODO:** `PATCH /production-orders/{id}` (header edit / cancel); a finished-goods warehouse model if products
  ever need to be stocked as sellable inventory.

### Production readiness — ✅ (`GET /production/readiness`)
- **Source:** [route](../src/app/api/production/readiness/route.ts) · [production.ts](../src/lib/server/data/production.ts) `getReadiness`.
- **Permission (DB):** `production_order.view`.
- **Query:** `product` (slug|code|uuid; omitted → first product with an Active BOM), `qty` (default 100).
- **Logic:** per-component `required = Σ pcb_line.qty × product_pcbs.qty × qty` vs `available`
  (Σ `inventory_balances.available` across the component's variants). The biggest shortage becomes
  `shortComponent`/`shortPN`/`missingQty` with its `sourcing` options (supplier price book). Returns
  `{ product, productSlug, qty, items[{component,genericPN,required,available,status}], shortComponent,
  shortPN, missingQty, sourcing[] }`. Drives the Readiness page and the Planner's shortage step.

### Component create — ✅ (`POST /components`)
- **Source:** [route](../src/app/api/components/route.ts) · [components.ts](../src/lib/server/data/components.ts) `createComponent`.
- **Permission (DB):** `component.create`; **`inventory.create` additionally** when any variant carries opening stock.
- **Body:** `{ genericPN, name, category?, description?, unit?, solderType?(SMD|DIP), footprint?, spq?, minStock?,
  reorderQty?(the form's MOQ), specs?[{key,value}], variants?[{brand(name), partNo, stock?}] }`.
- **Logic:** unique generic PN (else **409**); create the component (empty-key specs dropped); per variant resolve
  the brand by **name** (case-insensitive) or create one (slug = slugified name), then create
  `component_brand_variants`. Opening stock (`stock>0`) is seeded as an `inventory_transactions(type='IN',
  ref_type='opening')` into the default bin — the trigger projects the balance (needs a default bin, else 409).
- **Returns:** 201 `ComponentView` (derived `stock`/`available`/`stockStatus` reflect the opening rows).
- **Verified (DB):** create with a 750-unit Yageo variant + a 0-stock new brand → list shows stock 750/Healthy,
  new brand auto-created, empty spec filtered, duplicate PN → 409 (verification component removed afterwards).
- **Mock mode:** rejects 400 `mock_read_only`.

### Reports — yield — ✅ (`GET /reports/yield`)
- **Source:** [route](../src/app/api/reports/yield/route.ts) · [production.ts](../src/lib/server/data/production.ts) `getYieldReport`.
- **Permission (DB):** `report.view`.
- **Query:** `range` = `<n>m` (default `6m`, clamped 1–24). **Logic:** Σ `qty` of Completed `production_orders`
  bucketed by `date_trunc('month', updated_at)`, then **zero-filled** onto the last N calendar months (labelled
  `Jan…Dec`, oldest→newest) so the chart always renders. Returns `[{ month, yield }]`.
- **Note:** there is no `completed_at` column, so the month is taken from `updated_at` while status is Completed.

### Superadmin console — ✅ (`/superadmin/*`)
- **Source:** [routes](../src/app/api/superadmin) · [superadmin.ts (data)](../src/lib/server/data/superadmin.ts) · [superadmin.ts (guard)](../src/lib/server/superadmin.ts).
- **Access:** superadmin-only. `requireSuperadmin` reads `users.is_superadmin` (global table, no RLS); every
  mutation runs in `withSuperadmin`, which sets ONLY the user GUC — the `superadmin_all` PERMISSIVE RLS policies
  (docs/schema.sql §RLS) then grant full cross-tenant visibility/write on companies, memberships, roles,
  role_permissions and company_modules. Non-superadmins see the normal tenant-scoped policies (unchanged).
- **Overview:** one round-trip for the whole console — `users` (+memberships), `companies` (+counts +module maps),
  `roles` (+grants +member counts), plus `permissionMatrix` / `allPermissions` / `moduleIds` for the UI.
- **Guards:** duplicate email/code → 409; creating a company seeds an Admin role granting the full matrix;
  a superadmin cannot deactivate or de-superadmin themselves; a role with members cannot be deleted;
  grants are validated against the permission matrix; setting a default membership clears the prior default.
