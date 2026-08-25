# Session Handoff — StackIOT ERP

> Paste this into the new chat: *"Read docs/SESSION-HANDOFF.md and continue."*

## Project
StackIOT ERP — electronics/PCB contract-manufacturing ERP. **Next.js 16 (App Router) + React 19 + Prisma/PostgreSQL with RLS.** Multi-tenant; every data route is session → RLS → `assertPermission`.

## Critical working notes (read first)
- **DB:** local `postgresql://…@localhost:5432/stackiot_erp`. `DATABASE_URL` = app role **`erp_app`** under RLS; `DIRECT_URL` = owner **`postgres`**, bypasses RLS for migrations/probes.
- **Migrations:** apply with **`npx prisma migrate deploy`** (NOT `migrate dev`). `schema.prisma` is **NOT** the source of truth — hand-written SQL migrations are; **new tables/columns are accessed via raw SQL** (`$queryRaw`/`$executeRaw`), not the generated Prisma client.
- **Typecheck:** `npx tsc --noEmit 2>&1 | grep -v "\.next/"`.
- **F1–F3 verify (still authoritative):** `npx tsx scripts/verify-items-migrations.ts` — run this after any ledger/items change.
- **Can't log in from the agent.** Verify via `tsc` + SQL probes over `DIRECT_URL`. User verifies UI by logging in.
- **`hint` field on `ApiError` is the standard pattern** for surfacing remediation to users. Populate it on any new 4xx/409.
- **Keep token use low.** Prefer targeted edits; delegate mechanical sweeps to a subagent.

## Read on load
- `memory/project_universal_item.md` — the invariant: everything is an Item with a lot.
- `memory/project_transformation_plan.md` — full history: F1–F7 + Slices for the add-form and stage/category work.
- `memory/feedback_incremental_rollout.md` — plan first, ship one slice at a time, everything demoable and non-breaking.

## Where we are RIGHT NOW (end of 2026-08-25 session — legacy retirement complete)

The **universal-item transformation critical path (F1→F7) is shipped**. **F6.4 is closed end-to-end** (B1 → B4 shipped earlier, D1 → D4 shipped this session). **`pcb_lines`, `product_pcbs`, and `bom_versions` are gone from the DB.** All legacy PCB/product UI + APIs + data layers deleted (~4100 lines removed). **F5.6 is shipped**, verifier + dead-code passes done. Working tree clean.

Head of `main`:

- `b6f9d36` feat(items): **retire legacy PCB/product UI + API + tables (D3/D4)**  ← this session
- `56efc43` refactor: **port dashboard + bootstrap + brands guard readers to universal BOM (D1)**  ← this session
- `cf2fac6` chore: delete dead code from the pre-universal ledger + form path
- `ba79881` fix(verify): update balances-rollup check for post-F5.4 CBV nullability
- `99e4b5f` feat(items): brand-variant CRUD on /items/edit (F5.6)
- `09810c5` fix(items): portal the BOM row typeahead so suggestions don't get clipped
- `ac1d7fe` feat(dashboard): source module counts + universal search from /api/items
- `ca28152` feat(items): fold PCB Management / Products modules into filtered item views
- `5ae7da9` feat(items): retire legacy structure pages, redirect to universal BOM editor (F6.4 / B4)
- `f0a1075` feat(production): explode BOMs from universal item_bom_lines (F6.4 / B3)
- `ea97987` feat(items): bidirectional BOM dual-write (F6.4 / B2)
- `f355484` docs: refresh SESSION-HANDOFF after F6.4 B1 lands
- `66f290b` feat(items): typeahead + inline child creation on the BOM editor page
- `29e9f6c` feat(items): create-child-on-submit for unlinked BOM rows
- `c30ca37` refactor(items): match PCB Add-Manually UX for BOM row picker
- `9835463` feat(items): add BOM section to the item add form
- `67168bf` fix(items): make Edit/Create BOM button reachable on details page
- `91a8d32` feat(items): **universal BOM editor (F6.4 / B1)**
- `36f109b` docs: refresh SESSION-HANDOFF after Slices 1–3 land
- `d197125` feat(items): is_finished_good flag (Slice 3)
- `0bfa509` feat(items): Stage-driven category picker (Slice 2)
- `5363bf1` feat(items): categories require a stage (Slice 1)
- `2916e7c` Refactor code structure and remove redundant changes  ← F1–F7 landed here

The ERP now has:

- **One `items` master** for every stage (raw / semi-assembled / assembled / consumable / asset / packaging), plus `item_variants` and generalized `item_lots`.
- **Universal ledger** keyed on `item_variant_id` — purchased AND manufactured items hold stock.
- **Universal BOMs** (`item_bom_versions` / `item_bom_lines`) — read, write, activate, delete. Add-form seeds a Draft inline; details page routes to the editor; both surfaces support inline child creation (new item POSTed with `minStock: 10`, zero opening stock) and portalled typeahead suggestions that escape the table's overflow clip.
- **Production explodes universally** — `createProductionOrder` recurses `item_bom_versions (Active)` + `item_bom_lines` with a depth-guarded CTE; verified same 17-component demand shape as legacy on ROIP400.
- **Legacy structure pages retired** — `/pcb-management/structure` and `/products/structure` server-redirect to `/items/[id]/bom`. `pcb_lines`, `product_pcbs`, and `bom_versions` tables were dropped in D4 (this session); `pcbs`, `pcb_revisions`, `products` kept for parent identity/metadata.
- **Modules consolidated** — `/pcb-management/list` and `/products/list` are now filtered `/api/items` views. Nav labels rebranded: "Products" → **Assembled Products**, "PCB Management" → **Semi-assembled**. Workspace tabs stripped (single-page each). Dashboard KPIs and universal search now read from `/api/items`. Suppliers breadcrumbs (`from=products` / `from=pcb`) point at the new filtered URLs.
- **Full universal item UI**: `/items/list`, `/items/add`, `/items/edit/[id]`, `/items/details/[id]`, `/items/[id]/bom`, plus the universal `/components/inventory` page (F5.9) with FEFO / pin-lot / multi-lot-split Stock In/Out.
- **Legacy `/components/*` and `/pcb-management/*` and `/products/*`** — every page is either a filtered items view or a server-redirect to `/items/*`.

### Migrations added this session (in order)
- `20260819000000_items_universal_master` (F1) — items + item_variants
- `20260819000001_items_backfill` (F2) — mirror components/products/pcb_revisions → items
- `20260819000002_ledger_item_variant_dual_write` (F3) — ledger dual columns + sync trigger
- `20260821000000_items_generic_pn` (P4b) — items.generic_pn
- `20260821000001_items_board_meta` (P5) — solder/footprint/spq
- `20260821000002_items_packaging_meta` (P6)
- `20260821000003_items_storage_meta` (P7)
- `20260821000004_items_asset_meta` (P8) — custodian FK + serial (tenant-unique) etc.
- `20260821000005_role_permissions_item_mirror` (F5.2) — item.* perms mirrored from component.*
- `20260821000006_ledger_sync_bidirectional` (F5.3) — reverse trigger direction
- `20260821000007_ledger_cbv_nullable` (F5.4) — drop NOT NULL, flip projection key
- `20260821000008_default_lot_by_item_variant` (F5.4 follow-up) — `assign_default_lot` keys on IV
- `20260821000009_item_boms_universal_master` (F6.1)
- `20260821000010_item_boms_backfill` (F6.2)
- `20260824000000_categories_require_stage` (Slice 1) — every category has a stage, seeded Bare/Populated PCBs
- `20260825000000_items_is_finished_good` (Slice 3) — items.is_finished_good NOT NULL DEFAULT false, backfilled from products

### F6.4 B1 shipped this session — universal BOM editor
- **Data layer** (`src/lib/server/data/items.ts`):
  - `createItemBomVersion(itemId, {version?, effectiveFrom?, effectiveTo?, copyLinesFromVersionId?})` — new Draft, optional seed-from copy. Auto-numbers `vN`.
  - `saveBomLines(itemId, versionId, lines[])` — whole-version replace on Draft only. Server diffs by `(versionId, childItemId)`.
  - `activateBomVersion(itemId, versionId)` — Draft → Active, supersedes prior Active in same tx.
  - `deleteBomVersion(itemId, versionId)` — Draft-only soft-delete.
  - `assertNoCycles` — recursive CTE over Active/Draft BOMs; blocks self-loops fast-path.
  - `assertParentIsBomCapable` — refuses raw items.
- **API**: `POST /api/items/[id]/bom`, `PATCH /api/items/[id]/bom/[versionId]`, `POST /api/items/[id]/bom/[versionId]/activate`, `DELETE /api/items/[id]/bom/[versionId]`.
- **UI editor** at `/items/[id]/bom` — version dropdown, activate/delete/new-revision, whole-version save with typeahead-in-row child picker.
- **Add-form BOM section** on `/items/add` — optional "Assembly / BOM" chip, add-mode only, chained after item POST + variant POSTs to seed a Draft, then flip redirect target to the BOM editor to Activate.
- **Details page**: "No BOM yet — Create BOM" empty-state for non-raw items without a BOM; primary "Edit BOM" button when a BOM exists.
- **Inline child creation on both surfaces**: type a name that doesn't match → sparkles marker → on save/submit, POST `/api/items` creates the new item (with `minStock: 10` default, zero opening stock), then its id feeds the BOM lines. Legend: Link2 = existing catalog item; Sparkles = new item that will be created.
- UX mirrors `src/components/pcb/pcb-form.tsx` (the "Add Manually" pattern from `/pcb-management`).

### Slice 1 + Slice 2 shipped this session (the Stage/Category model)
Per user's request:

- **Slice 1**: `item_categories.default_item_type` is now NOT NULL. Category-create API requires `defaultItemType`. Seeded **Bare PCBs** (raw) and **Populated PCBs** (semi_assembled) into every tenant.
- **Slice 2**: Add-form Section 1 renamed to **"Stage"** with two groups (Build stage: Raw / Semi-assembled / Assembled; Other: Consumable / Asset / Packaging). Category cascade filtered to the chosen stage (`<CategoryCascade stageFilter={itemType} />`). "+ Add category" auto-uses the current stage. Category → type auto-detect removed (one-way flow now). Item-type lock on the edit form removed (soft warning instead).

### Slice 3 (SHIPPED this session)
`items.is_finished_good boolean NOT NULL DEFAULT false` + a "This is a finished good (we sell it)" checkbox in Section 1 of the add/edit form. Independent of stage — a Populated PCB can be `semi_assembled` **and** sellable. Backfilled `true` for every product-backed item (that WAS the finished-goods master). Threaded through `ItemView` / API bodies / form state / duplicate-from. Partial index `(company_id) WHERE is_finished_good` for the future "list sellable items" query. Verified: 26 items → 1 finished good (ROIP400), 25 non-finished.

## Open items — user's roadmap

### F6.4 — BOM write cutover (COMPLETE this session)

- **B2 — Legacy ↔ universal dual-write (SHIPPED).** Bidirectional. Decisions taken: bidirectional direction; **banner** for universal-only parents (no reject, no auto-shadow). Concrete impl:
  - `mirrorUniversalBomToLegacy(tx, ctx, parentItemId, versionId)` in `items.ts` — called from `activateBomVersion`. Whole-version replace of `pcb_lines` (for pcb-revision parents) or `product_pcbs` (for product parents). Product parents lazy-create the `bom_versions` shadow row when the universal version has no `legacy_bom_version_id`. PCB-revision parents also promote `pcb_revisions.status='Active'` and demote sibling revs; product parents promote/demote `bom_versions.status`.
  - `mirrorLegacyBomToUniversal(tx, ctx, {kind, id})` in `items.ts` — called from `updatePcbRevision` (per this rev + every demoted sibling), `deletePcbRevision`, `updateProductPcbRevision`, `deleteCatalogProduct`. Whole-version replace; lazy-creates the `item_bom_versions` row if the legacy row post-dates F2.
  - UI banner ("not yet visible to production") shows on `/items/[id]/bom` whenever `parentLegacyKind === null` (item has no legacy `pcb_revisions` / `products` row) — Activate still works but won't drive production until B3 flips.
  - **Rule that fell out:** legacy ALWAYS reflects the currently-Active universal BOM, and vice versa. Nothing else.
  - **Non-mirrored legacy paths** (accepted risk pre-B4): `createPcb`, `createNextRevision`, `createCatalogProduct` — new legacy rows post-B2 don't get an items mirror until F2 runs again. These flows aren't used post-F2 in the current tenants (probe: zero drift).

- **B3 — Production explosion cutover (SHIPPED).** `createProductionOrder` + readiness now recurse `item_bom_lines` from the product's Active `item_bom_versions`. Depth-guarded recursive CTE. Leaves = items with no Active BOM below them; they must exist in `components` (else a clear 409 with `orphanItemIds`). `production_orders.bom_version_id` still snapshots the legacy `bom_versions.id` (via `legacy_bom_version_id`) for historical continuity — NULL when a universal-only product runs (won't happen while B2 lazy-creates the shadow). **Shape check passed** against ROIP400: 17 components, per-unit qtys identical to the legacy explosion.

- **B4 — Legacy structure page retirement (SHIPPED, partial).** `/pcb-management/structure?pcb=<slug|id>` and `/products/structure?product=<slug|id>` are now Server Components that resolve the parent item's id (Active revision id for PCBs, product id for products) and `redirect()` to `/items/[id]/bom`. Fallback → `/items/list`.
  - **NOT SHIPPED yet (deliberately gated):** dropping `pcb_lines` / `product_pcbs` tables + deleting legacy data-layer code. Many read paths still exist (dashboard, bootstrap, brands, components.usage, pcbs.ts detail queries). Retire after (a) B3 has driven real production orders for a session, and (b) those read paths are ported to universal — that's a separate slice.

- **B5 (optional)** — Version workflow polish: effective dates, supersede workflow, diff between versions.

### Module consolidation — SHIPPED this session

`ca28152` + `ac1d7fe` folded `/pcb-management/list` and `/products/list` into filtered `/api/items` views. Nav rebranded ("Products" → **Assembled Products**, "PCB Management" → **Semi-assembled**), workspace tabs stripped (single-page each), dashboard KPI tiles + universal search re-sourced from `/api/items`, suppliers `from=` breadcrumbs pointed at the new URLs, and the terminology pass replaced "Sub-assembly" / "Finished good" with "Semi-assembled" / "Assembled" everywhere. `Add item` links pass `?type=` so `/items/add` pre-selects the stage.

**Still open — the revisions model.** Today `pcb_revisions.id → items.id` (F2) so each revision IS a separate item. Alternative: **Option B** — collapse to one item-per-PCB with revisions captured by `item_bom_versions` (Rev A = Active, Rev B = new Draft → activate → prior becomes Superseded). Cleaner mental model but a real data migration (merge N revision items into one, migrate inbound refs from POs / ledger / production runs / BOM child links, redirect the N legacy revision URLs). No blocker — Option A works fine post-consolidation — but worth doing as a standalone slice if the current model starts to hurt.

### Typeahead portal fix — SHIPPED this session

`09810c5` — the BOM row typeahead dropdown was being clipped by the table's `overflow-x-auto` wrapper on both surfaces. Portalled the suggestions `<ul>` to `<body>` with `position: fixed`, anchored to the input's `getBoundingClientRect()`; repositions on scroll/resize. Applied to `/items/[id]/bom` editor and the `/items/add` Assembly / BOM section.

### F5.6 — Brand-variant CRUD on /items/edit (SHIPPED this session)

`99e4b5f` — the Manufacturer section on `/items/edit` was rendering rows for context but ignoring changes. Users had to detour through legacy `/components/*` to add, rename, or remove a variant. F5.6 wires proper edit persistence:

- **`updateItemVariant(itemId, variantId, {brand?, partNo?, isDefault?})`** — purchased-only. Brand resolves via `resolveOrCreateBrand`; a change enforces the F1 `(item, brand, purchased)` partial-unique index with a friendly 409. Promoting to default demotes prior default in the same tx. Un-defaulting directly is refused ("promote a sibling instead"). Mirrors `brand_id` + `part_no` onto the legacy `component_brand_variants` row (id shared since F2). CBV has no `is_default` column, so the default flag is universal-only.
- **`deleteItemVariant(itemId, variantId)`** — purchased-only. Guards: positive on-hand (any location) → 409; open Draft/Sent/Dispatched PO line matching `(component_id, brand_id)` → 409; last-remaining variant → 409. If the deleted row was default, the earliest surviving variant auto-promotes. Soft-deletes on both `item_variants` and the mirror CBV row.
- **API**: `PATCH` + `DELETE` on `/api/items/[id]/variants/[variantId]`.
- **Form**: `UniversalItemInitial.variants` widened to include `id` + `brandId`; `MfrRow` gains `id`; amber "not persisted" note replaced with a blue info line explaining the guards + auto-promote. Submit chain in edit mode diffs `mfrRows` against `initial.variants` and fires DELETE → PATCH → POST in that order (deleting the default hands off before a PATCH can fight a sibling). Failures land in the same partial-success toast.
- Verified against seeded CAP-100UF: three variants, all with stock, one with an open PO — delete guard fires correctly for all three.

### Verifier drift (SHIPPED this session)

`ba79881` — the "balances rollup: same totals whichever variant column keys the sum" check was false-positive-failing post-F5.4 (CBV nullable → NULL-bucket collision on the CBV side). Replaced with two checks that reflect what actually matters now: every live balance carries `item_variant_id`; when CBV is present, it equals `item_variant_id` (F2/F3 identity link). All green.

### Dead-code cleanup (SHIPPED this session)

`cf2fac6` — six files deleted after grep confirmed no live importers outside the cluster:
- `src/lib/stock-ledger.ts` + `src/lib/use-stock-ledger.ts` (pre-F5.9 CBV-scoped ledger)
- `src/components/inventory/stock-move-modal.tsx` (replaced by `ItemStockMoveDialog` at F5.9)
- `src/components/inventory/transaction-history-table.tsx` (legacy history table)
- `src/app/components/component-form.tsx` (retired at P15c)
- `._probe.ts` at repo root (Windows-hidden leftover from `2916e7c`)
Stale header comments on `/components/add/page.tsx` and `item-stock-move-dialog.tsx` refreshed to reflect the deletions.

### D1–D4 shipped this session — legacy BOM retirement

- **D1 (`56efc43`)** — Infrastructure readers ported to universal BOM:
  - `dashboard.blockerRows`, `productStatus`, `consumedRows`, `usageImpact` — recursive `explode` CTE over `item_bom_versions (Active)` + `item_bom_lines`, terminating at leaves.
  - `bootstrap.linesByPcb`, `bootstrap.pcbsByProduct` — joined through universal tables; product-pcb projection filters `child_item_id ∈ pcb_revisions` for client parity.
  - `brands.deleteGuard` — `pcb_lines.preferred_brand_id` → `item_bom_lines.preferred_brand_id`.
  - Verified: per-product per-component demand tuples identical between legacy and universal on ROIP400 (17 leaves). Brand-in-use counts identical across three brands.
- **D3 (`b6f9d36`)** — retired legacy UI + API + data layers:
  - **API deleted:** `/api/pcbs/*` (6 routes), `/api/products/*` (4 routes).
  - **UI deleted:** `src/components/pcb/*` (8 files: PcbForm, AddPcbModal, EditPcbModal, EditRevisionBomModal, CompareRevisionsModal, PcbRevisionsCard, ProductPcbRevisionSelector).
  - **Page deleted:** `/pcb-management/import` (Excel bulk PCB+product import).
  - **Data layer deleted:** `pcbs.ts` + `products.ts`.
  - **Mirror plumbing retired in `items.ts`:** `mirrorUniversalBomToLegacy`, `mirrorLegacyBomToUniversal`, `getParentLegacyKind`, `ParentLegacyKind`, `ItemBomView.parentLegacyKind`. The Activate mirror call is gone.
  - **BOM editor page:** "not yet visible to production" banner + "legacy structure pages still write" footer note both removed (neither statement is true any more).
  - **D2-minimum ports rolled in:** `items.ts::getItemPcbUsage` and `components.ts::deleteComponent` guard now walk `item_bom_lines` (from `pcb_lines`).
- **D4 (`b6f9d36`, same commit)** — migration `20260826000000_drop_legacy_bom_tables`:
  - `DROP TABLE product_pcbs CASCADE`
  - `DROP TABLE pcb_lines    CASCADE`
  - `DROP TABLE bom_versions CASCADE`
  - `pcbs`, `pcb_revisions`, `products` kept — bootstrap + BOM editor still read parent identity/metadata (slug, rev label, code, estimated_cost).
- **Production snapshot flip:** `production_orders.bom_version_id` now stores `item_bom_versions.id` instead of the legacy `bom_versions.id`. Historical rows keep their snapshot uuid (FK dropped by CASCADE → harmless orphan pointer).

### Still open
1. **`item_categories` — dedicated perm resource** — still guards on `component.*`. Small slice: mirror `role_permissions` from `component.*` → `item_category.*` (idempotent, same pattern as F5.2), swap the guards in `item-categories.ts`.
2. **Option B (revisions collapse)** — see Module consolidation section above. Standalone future slice: collapse `pcb_revisions` items into one item-per-PCB with revisions living in `item_bom_versions`. Real data migration; no current pain, but the mental model is cleaner.
3. **Original Batch A–D** (from very first handoff — never started, we went universal instead): Adjustment UI + reason codes, ABC classification, obsolescence workflow, landed cost, quarantine bin, cycle counting, in-transit transfers.

## DB state right now
- 4 companies: **StackIOT** (seeded — 17 components, 4 PCBs, ROIP400 product with BOM, stock), StackIOT Technologies Pvt Ltd, Test Co, **Dielectric Technologies Pvt. Ltd.** (user's fresh test tenant — 1 item "Registor 10ohm" with 500 on-hand in WH-01·A13).
- Categories: 40+ per tenant + the two new PCB categories. Every category has `default_item_type`.
- All F1–F3 verify checks green as of session end.

## Testing accounts
- `admin@stackiot.local` / `ChangeMe123!` → StackIOT (full seed data — use for BOM / production / stock tests).
- `stackiot@stackiot.tech` → StackIOT Technologies Pvt Ltd (no warehouse; use for empty-tenant flows).
- User's own login → Dielectric (their test tenant, has some data now).

## DB reset recipe (kept in case of nuclear-option testing)
> ⚠️ Discussed but the user opted NOT to reset — his fresh Dielectric tenant made resetting unnecessary. Keep for reference; note the sequencing gap: a fresh reset runs the F2/F6.2 backfills against an EMPTY DB, then seeds legacy tables — so universal screens would come up empty. If you ever do reset, either write a `scripts/reseed-all.ts` that runs seed BEFORE re-invoking the backfills, or accept that universal screens start empty.

```bash
DURL=$(grep -oE 'DIRECT_URL="?[^"]+' .env | sed 's/DIRECT_URL=//; s/"//g')
cat > ._reset.sql <<'EOF'
DROP SCHEMA public CASCADE; CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO PUBLIC;
EOF
DIRECT_URL="$DURL" DATABASE_URL="$DURL" npx prisma db execute --file ._reset.sql
npx prisma migrate deploy && npx prisma generate
# CRITICAL: regrant to erp_app (bootstrap SQL still targets legacy "stack" role)
cat > ._grants.sql <<'EOF'
GRANT USAGE ON SCHEMA public TO erp_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO erp_app;
GRANT USAGE, SELECT                 ON ALL SEQUENCES  IN SCHEMA public TO erp_app;
GRANT EXECUTE                       ON ALL FUNCTIONS  IN SCHEMA public TO erp_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES    TO erp_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT USAGE, SELECT                  ON SEQUENCES TO erp_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE                        ON FUNCTIONS TO erp_app;
EOF
DIRECT_URL="$DURL" DATABASE_URL="$DURL" npx prisma db execute --file ._grants.sql
rm ._reset.sql ._grants.sql
npx tsx scripts/seed-admin.ts && npx tsx scripts/seed-sample.ts && npx tsx scripts/seed-inventory.ts && npx tsx scripts/seed-purchases.ts && npx tsx scripts/seed-default-categories.ts
```

## Key files (quick reference)
- **Universal item form:** `src/components/items/universal-item-form.tsx` — the shared form (mode="add"|"edit"). 1600+ lines, all sections.
- **Item data layer:** `src/lib/server/data/items.ts` — `listItems`, `getItem(InTx)`, `createItem`, `updateItem`, `deleteItem`, `addItemVariant`, `getItemStock`, `getItemBom`, `getItemLedger`, `getVariantLots`, `getItemPcbUsage`.
- **Universal inventory page:** `src/app/components/inventory/page.tsx` (rebuilt on `/api/items`).
- **Universal stock dialog:** `src/components/inventory/item-stock-move-dialog.tsx` — In/Out, FEFO/pin-lot/multi-lot-split.
- **Detail page:** `src/app/items/details/[id]/page.tsx` — Master, Manufacturer, Board/Packaging/Storage/Asset, BOM, PCB-usage, stock rollup, lots, movement history.
- **Category cascade:** `src/components/category-cascade.tsx` — now with `stageFilter` prop.
- **Inventory data layer:** `src/lib/server/data/inventory.ts` — fully re-keyed on `item_variant_id` (F5.7). Legacy `getComponentStock` still there for legacy paths.
- **Production:** `src/lib/server/data/production.ts` — `completeProductionOrder` writes finished-goods PRODUCTION row.
- **Perms matrix:** `src/lib/permissions.ts` — `item: CRUD` (F5.2).
- **F1–F3 verify:** `scripts/verify-items-migrations.ts` — always run after ledger/items changes.
- **Default categories seed:** `scripts/seed-default-categories.ts` — idempotent, seeds 40-node taxonomy per company.

## Design decisions locked earlier (don't relitigate)
- Items and Inventory stay **separate workspaces** — module-licensed separately. Cross-links via `?from=` + gated buttons.
- Universal items = **single source of truth**; legacy `components`/`products`/`pcbs` stay writable during transition, but every new UI reads via `items`.
- **Category = one stage** (Slice 1). Bare PCBs and Populated PCBs are separate categories.
- **Item type ≠ role.** "Assembled" is a stage; "finished good" is a role → will be an `is_finished_good` flag (Slice 3, pending).
- Legacy `StockMoveModal` was deleted in the F5.6 cleanup pass — inventory uses `ItemStockMoveDialog` (item-variant-keyed). No CBV in the new write path.
- `hint` field on `ApiError` is the standard for surfacing remediation.

## Repo state
Universal-item transformation is now fully closed at the DB, API, and UI layers. Legacy `pcb_lines` / `product_pcbs` / `bom_versions` are dropped; every remaining reader is on `item_bom_*`. Working tree clean. Suggested next targets: **`item_categories` perm resource** (small, self-contained) or **Original Batch A–D** (inventory enrichment — Adjustment UI + reason codes is the cheapest place to start).
