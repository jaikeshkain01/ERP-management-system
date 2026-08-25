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

## Where we are RIGHT NOW (end of 2026-08-25 session — Slices 1–3 committed)

The **universal-item transformation critical path (F1→F7) is shipped and COMMITTED**. Slices 1–3 of the Stage/Category model are also committed on `main`:

- `d197125` feat(items): is_finished_good flag (Slice 3)
- `0bfa509` feat(items): Stage-driven category picker (Slice 2)
- `5363bf1` feat(items): categories require a stage (Slice 1)
- `2916e7c` Refactor code structure and remove redundant changes  ← F1–F7 landed here

Working tree is clean.

The ERP now has:

- **One `items` master** for every kind of thing (raw / semi-assembled / assembled / consumable / asset / packaging), plus `item_variants` and generalized `item_lots`.
- **Universal ledger** keyed on `item_variant_id` — purchased AND manufactured items hold real stock (F5.3/F5.4 lifted the CBV NOT NULL and flipped the projection).
- **Universal BOMs** (`item_bom_versions` / `item_bom_lines`), backfilled from PCB + product BOMs, read side + viewer done (F6).
- **Production books finished goods** into stock (F7 — completing a production order writes a `PRODUCTION` ledger row for the product's manufactured variant).
- **Full universal UI** on top: `/items/list`, `/items/add`, `/items/edit/[id]`, `/items/details/[id]`, and a **rebuilt `/components/inventory` page** on the universal master with Stock In/Out (FEFO / pin-lot / multi-lot split).
- Legacy `/components/list`, `/components/add`, `/components/edit`, `/components/details` are all server-redirect wrappers to `/items/*`.

**Everything is UNCOMMITTED on `main`.** ~15 migrations + a lot of app code. **Committing this is the single most important open task.**

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

### Slice 1 + Slice 2 shipped this session (the Stage/Category model)
Per user's request:

- **Slice 1**: `item_categories.default_item_type` is now NOT NULL. Category-create API requires `defaultItemType`. Seeded **Bare PCBs** (raw) and **Populated PCBs** (semi_assembled) into every tenant.
- **Slice 2**: Add-form Section 1 renamed to **"Stage"** with two groups (Build stage: Raw / Semi-assembled / Assembled; Other: Consumable / Asset / Packaging). Category cascade filtered to the chosen stage (`<CategoryCascade stageFilter={itemType} />`). "+ Add category" auto-uses the current stage. Category → type auto-detect removed (one-way flow now). Item-type lock on the edit form removed (soft warning instead).

### Slice 3 (SHIPPED this session)
`items.is_finished_good boolean NOT NULL DEFAULT false` + a "This is a finished good (we sell it)" checkbox in Section 1 of the add/edit form. Independent of stage — a Populated PCB can be `semi_assembled` **and** sellable. Backfilled `true` for every product-backed item (that WAS the finished-goods master). Threaded through `ItemView` / API bodies / form state / duplicate-from. Partial index `(company_id) WHERE is_finished_good` for the future "list sellable items" query. Verified: 26 items → 1 finished good (ROIP400), 25 non-finished.

## Open items — user's roadmap
1. **F6.4** — BOM write cutover: repoint PCB-structure + product-structure editors + production's demand explosion onto `item_bom_*`; then retire `pcb_lines`/`product_pcbs`.
2. **F5.6** — Brand-variant CRUD on `/items/edit` (the P15 gap — currently the Manufacturer section on edit shows a note that variant changes aren't persisted).
3. **Verifier drift** — `scripts/verify-items-migrations.ts` "balances rollup: same totals whichever variant column keys the sum" now fails because F5.4 made CBV nullable — the CBV-keyed sum lumps all `cbv=NULL` rows under one bucket while the IV-keyed sum splits them by real IV. Not a data bug; the check is obsolete post-F5.4. Update the check to skip NULL CBV keys OR replace it with an IV-keyed equivalent.
4. **Legacy retirement + dead-code cleanup** — delete `useStockLedger`, `stock-ledger.ts`, `StockMoveModal`, `TransactionHistoryTable`, `buildInventory`; eventually `component-form.tsx`; give `item_categories` its own perm resource. Also delete stray `._probe.ts` at the repo root (leftover from a prior commit — Windows hidden file, shouldn't be tracked).
5. **Original Batch A–D** (from very first handoff — never started, we went universal instead): Adjustment UI + reason codes, ABC classification, obsolescence workflow, landed cost, quarantine bin, cycle counting, in-transit transfers.

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
- Legacy Stock In modal (`StockMoveModal`) is deprecated but on disk — the rebuilt inventory page uses `ItemStockMoveDialog` instead. No CBV anywhere in the new write path.
- `hint` field on `ApiError` is the standard for surfacing remediation.

## Repo state
Everything from F1 through Slice 3 is committed on `main`. Working tree is clean. Next commit target is one of the open items above (likely F6.4 or F5.6).
