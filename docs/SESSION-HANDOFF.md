# Session Handoff — StackIOT ERP

> Paste this into the new chat: *"Read docs/SESSION-HANDOFF.md and continue."*

## Project
StackIOT ERP — electronics/PCB contract-manufacturing ERP. **Next.js 16 (App Router) + React 19 + Prisma/PostgreSQL with RLS.** Multi-tenant; every data route is session → RLS → `assertPermission`.

## Critical working notes (read first)
- **DB:** local `postgresql://…@localhost:5432/stackiot_erp`. `DATABASE_URL` = app role **`erp_app`** under RLS; `DIRECT_URL` = owner **`postgres`**, bypasses RLS for migrations/probes.
- **Migrations:** apply with **`npx prisma migrate deploy`** (NOT `migrate dev`). `schema.prisma` is **NOT** the source of truth — hand-written SQL migrations are; **new tables/columns are accessed via raw SQL** (`$queryRaw`/`$executeRaw`), not the generated client.
- **Typecheck:** `npx tsc --noEmit 2>&1 | grep -v "\.next/"`.
- **Can't log in from the agent** (auth gated; entering credentials disallowed). Verify via `tsc` + SQL probes over `DIRECT_URL`. User verifies UI by logging in.
- **DB was fully reset this session** (see below). Login: `admin@stackiot.local` / `ChangeMe123!`.
- **Bootstrap grants bug** — `scripts/sql/02-grant-runtime-privileges.sql` grants to legacy role `stack`; live app role is `erp_app`. After any `DROP SCHEMA public CASCADE`, re-grant to `erp_app` (recipe below) or the app returns permission-denied. Consider fixing the SQL file.
- **Keep token use low.** Prefer targeted edits; delegate mechanical sweeps to a subagent.

## Where we are RIGHT NOW (this session's arc)
Session started with the High/Medium/Low CRUD tier work already done. Added a large stack of features on top; DB then wiped for a fresh test. All code is uncommitted.

### Ship record — features live in code, not yet exercised by a logged-in user

**Toast + error UX (whole app)**
- Server error envelope now carries a `hint?: string` field ([http.ts](src/lib/server/http.ts)). Populated on ~13 conflict guards across purchases/production/warehouses/locations/lots/variants/categories/products/suppliers with concrete remediation text.
- Client [api-error.ts](src/lib/api-error.ts) `extractError()` extracts `{message, hint}`; every high-value toast renders the hint on a second line.
- Every toast in the app raised to `z-[70]` (above the `z-50` modal backdrop) and uses **opaque `bg-background`** + tinted border — fixes prior "toast unreadable behind blurred modal" and "translucent tint over content" issues.

**Cross-workspace nav (origin-aware, license-gated)**
- `?from=<workspace-id>` query param preserves source-workspace context when jumping into another workspace. `WorkspaceTabs` honours it; item-details + supplier-details switch breadcrumb + Back button accordingly.
- `isWorkspaceReachable(workspace, isEnabled)` helper — if `from=` names a locked module, the hint is silently dropped (falls back to path-based). Same used on item-details "Open in Inventory" button and Universal Search's Inventory chip: **licensed → outline button; unlicensed → dashed 🔒 chip with "not in your plan" tooltip**.
- 11 cross-workspace links converted (Purchases → Items/Suppliers/Brands, Suppliers ↔ Items, PCB Structure → Items/Suppliers/Brands, Product Structure → same).

**BOM Import moved to PCB Management**
- Old `/products/import` **deleted**. New page: **`/pcb-management/import`** with:
  - **Two-mode selector:** "Create product with PCBs" (each sheet → PCB inside one product; header fields Name/Code/Version/Description) OR "Import PCBs only" (each sheet → standalone PCB in catalog).
  - **Per-sheet include checkboxes** — untick garbage/rollup sheets; count/badge tallies only included sheets.
  - "Import BOM" button removed from `/products/list`, added to `/pcb-management/list`.

**PCB revisions ("division versions") — full multi-revision management**
- Schema already supported it (`pcb_revisions.status: bom_status`, `product_pcbs.pcb_revision_id`). App code was single-revision-only.
- Backend: `GET/POST /api/pcbs/[id]/revisions`, `PATCH/DELETE /api/pcbs/[id]/revisions/[revId]`, `GET /api/pcbs/[id]/usage` (Product↔Revision map), extended `GET /api/pcbs/[id]/bom?revision=<uuid>`.
- New `PcbRevisionsCard` on PCB Structure ([src/components/pcb/pcb-revisions-card.tsx](src/components/pcb/pcb-revisions-card.tsx)): revision list with status badges, per-row **inline BOM expand** (lazy fetch), **Set Active** (auto-demotes prior Active → Superseded), **Add revision modal** (blank or clone from another; auto-suggests next label like Rev B), **Edit BOM modal** (per-revision line editor with catalog type-ahead — [edit-revision-bom-modal.tsx](src/components/pcb/edit-revision-bom-modal.tsx)), **Delete revision** (guarded), **"Used by product" chip column** shows product-usage per revision.
- **Compare Revisions modal** ([compare-revisions-modal.tsx](src/components/pcb/compare-revisions-modal.tsx)): pick A/B → client-side diff by component id → Added/Removed/Changed/Same rows with per-field highlights + qty deltas. Toggle "show unchanged". Wired via ⇄ Compare button on `PcbRevisionsCard` (only shown when ≥2 revisions).
- Product-side pin swap: `PATCH /api/products/[id]/pcbs/[linkId]` + `ProductPcbRevisionSelector` compact dropdown on each PCB node on `/products/structure`. "Not primary" badge when product pins to a non-Active revision.
- Server invariant: **at most one Active revision per PCB** (promotion auto-demotes prior Active). Products **don't auto-migrate** when a PCB's Active changes — that's the whole point.

**Lot inventory enrichment on item details**
- Lot Inventory table shows: Lot · Mfr PN · **Supplier · Received · Mfg Date** · Expiry · **Date Code · MSL** · On Hand · Unit Cost · Value · Actions. Expiry colour-coded (amber ≤30d, red expired) with tooltip. Note indicator `*` on lots with notes. **Totals footer.**

**Stock Out — lot picker + multi-lot split**
- `POST /api/inventory/transactions` outbound accepts:
  - `lotId` (single-lot pin, overrides FEFO), or
  - `lotAllocations: [{lotId, qty}, ...]` (multi-lot split; sum must equal total qty; server writes one ledger row per allocation).
- Both validate lot belongs to variant + has enough on-hand **at the source location**.
- Stock modal (`StockMoveModal`): outbound-only Lot picker with **Auto (FEFO)** default + "Split across lots" toggle → editable {Lot, Qty, ✕} table with running total.
- **Barcode-ready polish** on lot/expiry inputs: `data-scannable="lot"|"expiry"`, `autoComplete="off"`, `spellCheck={false}`, `autoCapitalize="characters"`, `enterKeyHint="next"`. Ready for a scanner listener to drop in later (no scanner wired yet).

**Near-expiry surfacing**
- `GET /api/item-lots?expiringWithinDays=30` — filters to lots with expiry within N days (incl. already expired) that still have positive on-hand.
- Inventory page: **"Expiring ≤30d · N"** filter chip (amber tone when active, hidden if N=0).
- Dashboard: amber **"Expiring ≤30d"** KPI tile (`Clock` icon, appears only when N>0, gated on inventory module).

**Stock-In location picker (from earlier this session)**
- Optional destination-bin picker on inbound; default = warehouse's bulk/default bin.

**Universal Search enhancement**
- Component result preview shows both "Items" (arrow, primary) and **"📦 Inventory"** chip (licensed) / **"🔒 Inventory"** (unlicensed). Enter still routes to Items (primary path).

## Database reset done — current DB state

Fresh DB seeded this session. State:
- **1 user** (`admin@stackiot.local` / `ChangeMe123!`)
- 1 warehouse (MAIN), 15 manufacturers, 8 suppliers, 17 items, 26 variants, 4 PCBs (1 revision each), 1 product (ROIP 400), 26 opening ledger rows / lots, 3 PRs, 2 POs.
- Seeds ran (in this exact order): `seed-admin.ts` → `seed-sample.ts` → `seed-inventory.ts` → `seed-purchases.ts`.

### To repeat the reset
```bash
DURL=$(grep -oE 'DIRECT_URL="?[^"]+' .env | sed 's/DIRECT_URL=//; s/"//g')
# 1. wipe schema
cat > ._reset.sql <<'EOF'
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO PUBLIC;
EOF
DIRECT_URL="$DURL" DATABASE_URL="$DURL" npx prisma db execute --file ._reset.sql
# 2. migrations + client
npx prisma migrate deploy && npx prisma generate
# 3. **CRITICAL** — regrant to erp_app (bootstrap SQL still targets legacy "stack" role)
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
# 4. seed
npx tsx scripts/seed-admin.ts && npx tsx scripts/seed-sample.ts && npx tsx scripts/seed-inventory.ts && npx tsx scripts/seed-purchases.ts
```

## Open items — user's roadmap (in the order they wanted)

User last said "do sequence wise" through this batching (I paused before starting Batch A when they asked to reset the DB):

- **Batch A (UI-only, no migrations)** — *not yet started*
  - **Adjustment UI + reason codes** — the `ADJUSTMENT` type has a server endpoint but **no UI page exists**. Real feature = build the Adjustment modal from scratch (component context, signed qty, location, reason picker with standard codes: Cycle count / Damaged / Miscount / Write-off / Expired / Return / Other + required note when Other). Server accepts freetext `reason`, so no schema change.
  - **ABC classification** — compute per-item `annualConsumption × cheapest_unit_cost`, sort desc, bucket A (top 20%) / B (next 30%) / C (rest). Item list badge + filter chip. Client-side only (data already in bootstrap).

- **Batch B (needs migrations)** — *not yet started*
  - **Item obsolescence workflow** — new `lifecycle_status` column on `components` (Active / Obsolete). Block inbound on Obsolete; UI badge + status toggle. Migration required.
  - **Landed cost breakdown** — new columns on `item_lots` (freight/duty/handling). Revalue on-hand; PO receiving UI extension.

- **Batch C (warehouse ops)** — *not yet started*
  - **Damaged / Quarantine bin type** — extend `location_kind` enum with `quarantine`. Stock-out with "Damaged" reason routes here.
  - **Cycle counting flow** — new session table + dedicated page (draft → in-progress → posted).

- **Batch D (last)** — *not yet started*
  - **In-transit / two-step transfers** — either new `in_transit` bin type or a state column on transfers; Ship → Receive with settle event.

- **Barcode / QR scanner integration** — user asked to skip for now but keep UI ready (already done: `data-scannable` hooks in place).

## Design decisions locked earlier (don't relitigate)
- Items and Inventory stay **separate workspaces** — module-licensed separately. Cross-links via `?from=` + gated buttons is the pattern.
- The `hint` field on `ApiError` is the standard pattern for surfacing remediation to the user; new guards should populate it.

## Key files (quick reference)
- Spec: `docs/COMPONENTS-IMPROVEMENTS.md` · CRUD gaps: `docs/CRUD-AUDIT.md` · schema: `docs/schema.sql`
- Server: `src/lib/server/data/{components,inventory,item-lots,item-categories,warehouses,purchases,production,products,pcbs,suppliers}.ts` · `src/lib/server/http.ts` (ApiError + hint)
- Client shared: `src/lib/api-error.ts` (extractError) · `src/lib/modules.ts` (workspaceById, isWorkspaceReachable)
- PCB revisions: `src/components/pcb/{pcb-revisions-card,edit-revision-bom-modal,compare-revisions-modal,product-pcb-revision-selector}.tsx`
- Stock modal: `src/components/inventory/stock-move-modal.tsx` (lot picker + multi-lot split + barcode-ready)
- BOM import: `src/lib/bom-import.ts` · `src/app/pcb-management/import/page.tsx`
- Warehouses UI: `src/app/components/inventory/warehouses/page.tsx`

## Nothing is committed
All work above is uncommitted on `main`. Ask before committing.
