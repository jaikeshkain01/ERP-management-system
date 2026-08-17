# Session Handoff — StackIOT ERP

> Paste this into the new chat: *"Read docs/SESSION-HANDOFF.md and continue."*

## Project
StackIOT ERP — electronics/PCB contract-manufacturing ERP. **Next.js 16 (App Router) + React 19 + Prisma/PostgreSQL with RLS.** Multi-tenant; every data route is session → RLS → `assertPermission`.

## Critical working notes (read first)
- **DB:** local `postgresql://…@localhost:5432` (`DATABASE_URL` = app role under RLS; `DIRECT_URL` = owner, bypasses RLS for queries/migrations).
- **Migrations:** apply with **`npx prisma migrate deploy`** (NOT `migrate dev`). `schema.prisma` is **NOT** the source of truth — hand-written SQL migrations are; **new tables/columns are accessed via raw SQL** (`$queryRaw`/`$executeRaw`), not the generated client. Follow that pattern.
- **Typecheck:** `npx tsc --noEmit 2>&1 | grep -v "\.next/"` — ignore `.next/` artifact errors.
- **Can't log in from the agent** (auth is gated; entering credentials is disallowed). Verify via `tsc` + rollback SQL tests over `DIRECT_URL`. User verifies UI by logging in.
- **Keep token use low** — user asked repeatedly. Prefer targeted edits; delegate big mechanical sweeps to a subagent.

## Done this session
- **Items base fixes:** Min-Stock/Description/Unit added to form; removed demo defaults; one shared `stock-status.ts` helper.
- **Item generalization:** `item_type` (raw/semi_assembled/assembled/consumable/asset/packaging); category-conditional solder/footprint.
- **Category tree:** `item_categories` table (RLS+audit), `components.category_id`; multi-level **CategoryCascade** on list filter + form; inline "Add Category"; regrouped into Electronic Components → Passive → Capacitor etc.
- **BOM Import Review page** (`/products/import`): parse per-sheet → editable grid → auto-category from `Type` → red validation (≥1 PN) → dedup (generic PN → MPN → new) → persist. Parser splits Generic vs Manufacturer PN by header.
- **`generic_pn` nullable** + client id falls back to uuid (bootstrap).
- **"No P/N" status** badge + filter on the item list.
- **Rename (labels only):** Component→Item, Brand→Manufacturer across UI + nav (`src/lib/modules.ts`). Routes/tables/permissions unchanged.
- **Lot tracking (complete):** `item_lots` table; `inventory_transactions.lot_id` NOT NULL via auto-assign trigger; lot capture on Stock-In (no/expiry/cost/**supplier**); **FEFO** on stock-out + production consumption; lot column in history; per-lot on-hand+valuation card on item details. `docs/schema.sql` synced.
- **Supplier-on-Stock-In fix:** supplier now saved on the lot + shown in the transaction log (was dropped before).

## Migrations applied (in `prisma/migrations/`)
`item_categories_and_types` · `regroup_item_categories` · `fix_category_paths` · `magnetics_under_electronics` · `generic_pn_optional` · `component_needs_review` · `item_lots` · `lot_required`.

## Decisions locked (see docs/COMPONENTS-IMPROVEMENTS.md)
- Items model, every-item lot tracking, item_type = field + tree, MPN per manufacturer variant.

## Done since last handoff (2026-08-17)
- **🔴 High CRUD gaps closed** (backend only — no UI yet):
  - **Item lots CRUD** — `item-lots.ts` + `GET /api/item-lots?variantId=&componentId=`, `GET/PATCH/DELETE /api/item-lots/[id]`. Read carries derived on-hand + valuation; DELETE blocks lots with ledger movements. Perms: `inventory.view` (read) / `inventory.edit` (mutate — no `inventory.delete` exists).
  - **Item categories update/delete** — `PATCH/DELETE /api/item-categories/[id]`. PATCH renames/re-parents + re-paths node & descendants (prefix swap, cycle-guarded); DELETE blocks live children / assigned items.
  - **Item variants update/delete** — `PATCH/DELETE /api/components/[id]/variants/[variantId]`. DELETE blocks variants with stock movements or a supplier price.
  - Verified: `tsc` clean + rollback SQL probes over `DIRECT_URL`. **Not UI-wired and not yet exercised by a logged-in user.**

## UI wiring done (this session)
- **Item lots** — Lot Inventory card on item details (`/components/details`) lists all live lots via `GET /api/item-lots?componentId=` (now accepts generic_pn, not just uuid) with per-row **Edit** (full modal → `PATCH /api/item-lots/[id]`) + **Delete** (`DELETE`, 409 if the lot has movements).
- **Item variants** — Manufacturer Variants card: per-row **Edit** (brand/MPN → `PATCH …/variants/[variantId]`) + **Delete** (409 if stock/price). Surfaced the variant `id`: added optional `ComponentBrandVariant.id?` + `bootstrap.ts` (`v.id AS "variantId"` + GROUP BY). Mock mode omits id → buttons hidden.
- **Item categories** — `CategoryCascade` gained a `manage` prop (inline rename/delete of the deepest selected node → `PATCH`/`DELETE /api/item-categories/[id]`); enabled in the item form's Category picker.
- Verified: `tsc` clean + route-contract match. **UI still to be confirmed by a logged-in user.**

## Medium-tier CRUD done (this session — backend + UI)
Backend (`warehouses.ts` / `products.ts` / `purchases.ts` / `production.ts`; perms reuse existing `warehouse.*` / `product.edit` / `purchase_*.delete` / `production_order.delete`):
- **Warehouses CRUD** — `POST /api/warehouses`, `GET/PATCH/DELETE /api/warehouses/[id]`.
- **Storage-location (bin) CRUD** — `POST /api/warehouses/[id]/locations`, `PATCH/DELETE …/locations/[locId]`.
- **Products PATCH** — `PATCH /api/products/[id]` (header fields; `updateCatalogProduct`).
- **PR/PO read-one + cancel** — `GET /api/purchase-{requests,orders}/[id]`, `POST …/cancel`.
- **Production-order cancel** — `POST /api/production-orders/[id]/cancel` (Draft/Ready only, releases allocations).

UI wired:
- **Warehouse+bin management** — NEW page `/components/inventory/warehouses` (src/app/components/inventory/warehouses/page.tsx) + "Warehouses" tab in the Inventory workspace (`modules.ts`). Left = warehouse list (add/edit/delete); right = the selected warehouse's zone→rack→bin locations (add/edit/delete, default-bin star). Kind is immutable on location edit.
- **Product edit** — pencil button on catalog (non-imported) product cards in `/products/list` → header-field modal (name/code/version/status/description).
- **PR cancel** — Cancel button on Draft/Pending rows in `/purchases/requests` + confirm modal.
- **PO cancel** — Cancel button on non-Completed rows in `/purchases/orders` + confirm modal.
- **Production-order cancel** — Ban button on Draft/Ready kanban cards in `/production/orders` + confirm modal.
- Verified: `tsc` clean + DB SQL probe. **UI to be confirmed by a logged-in user** (login is agent-gated).

## Open items / next
1. **CRUD gaps** — remaining 🟡 Low: supplier-price delete (`DELETE /api/suppliers/[id]/prices/[priceId]`); single-read endpoints as needed.
3. **Physical rename** (deferred, large/risky): `/components`→`/items` routes + DB tables + `/brands`→`/manufacturers`.
4. Optional: FEFO already covers production consume; per-lot view done.

## Key files
- Spec: `docs/COMPONENTS-IMPROVEMENTS.md` · CRUD gaps: `docs/CRUD-AUDIT.md` · schema: `docs/schema.sql`
- Items data: `src/lib/server/data/components.ts`, `inventory.ts`, `bootstrap.ts`
- Category cascade: `src/components/category-cascade.tsx` · form: `src/app/components/component-form.tsx`
- BOM import: `src/lib/bom-import.ts`, `src/app/products/import/page.tsx`
- Lots: `item_lots` table; logic in `inventory.ts` (`resolveInboundLot`, `pickOutboundLot`, `getComponentStock.byLot`)
