# StackIOT ERP — UI Structure & Data Architecture

> Reference for backend design. Describes every screen, the data each one reads/writes,
> the entity model behind the UI (`src/mockdata`), how entities link, and a proposed
> backend contract that mirrors the current front-end shapes.

**Stack:** Next.js 16 (App Router, all pages `"use client"` except redirects), React 19,
Tailwind v4, shadcn/base-ui components, `recharts` for charts, `lucide-react` icons.
**Persistence today:** none — data is in-memory (`src/mockdata`) with a few pages caching
user edits in `localStorage`. The backend replaces both.

---

## 1. Domain model (source of truth: `src/mockdata`)

Five **canonical entities**. Everything references everything else by `id`.

### Component  (`components.ts`) — the hub
| Field | Type | Notes |
|---|---|---|
| `id` | string (slug) | PK, e.g. `resistor-10k` |
| `genericPN` | string | Generic/internal part number, e.g. `RES-10K` |
| `name` | string | |
| `category` | string | Passive, IC, MCU, Memory, Connector, RF, Optoelectronics, Protection, Frequency, Peripherals |
| `description` | string | |
| `stock` | number | On-hand qty |
| `minStock` | number | Safety threshold |
| `reorderQty` | number | |
| `unit` | string | e.g. `PCS` |
| `bin` | string | Warehouse location, e.g. `A-12` |
| `lastCount` | string (ISO date) | Last stock count |
| `solderType` | `"SMD" \| "DIP"` | |
| `footprint` | string | e.g. `R0603` |
| `spq` | number | Standard pack qty (also used as MOQ proxy) |
| `annualConsumption` | number | Drives usage/coverage analytics |
| `specs` | `{ key, value }[]` | Free-form spec sheet; **order-significant** (array position = display order; backend uses `component_specs.display_order`) |
| `brandVariants` | `{ brandId, partNo, stock }[]` | **→ Brand** (a brand's part number + stock for this component) |
| `offers` | `{ supplierId, brandId, price, leadTimeDays }[]` | **→ Supplier + Brand** (a supplier's current price for a brand variant). Backend table: **`supplier_component_prices`** — adds `currency`, `moq`, `spq`, `valid_from/valid_to` (temporal price book); the mock holds only the *current* price. |

`price` and `leadTimeDays` are **numbers** (INR, days). The UI formats them at render (`formatINR`, `formatLeadTime`).

> **Stock caveat:** `component.stock`, `component.brandVariants[].stock`, `pcb.stockCount` are
> flat numbers in this front-end mock **for display only**. In the backend they must **not** be
> stored on these tables — quantity is owned by the Inventory module and derived. See §7a.

### Brand  (`brands.ts`)
`id` (PK), `name`, `description`, `headquarter`, `founded`, `status` (`Approved|Pending`), `rating` (number).

### Supplier  (`suppliers.ts`)
`id` (PK), `name`, `description`, `contact`, `email`, `phone`, `address`, `terms`, `rating` (number), `status` (`Active|Inactive`).

### PCB  (`pcbs.ts`)
`id` (PK), `name`, `description`, `layers` (number), `status` (`Active|Prototype|Deprecated`),
`componentsCount` (headline BOM line count), `stockCount` (finished-board stock),
`lines: { componentId, qty, refDes?, preferredBrandId?, remarks? }[]` — **→ Component** (the BOM).
Each line carries **qty per board**, **reference designators** (`R1-R20`, `C1-C10`, `U1` — the
board positions engineers read), a **preferred manufacturer brand** (→ Brand), and free remarks.

### Product  (`products.ts`)
`id` (PK), `name`, `code` (e.g. `ROIP400`), `version`, `description`,
`status` (`Ready|Blocked|Limited`), `estimatedCost` (number), `buildableQty` (number),
`pcbs: { pcbId, qty, sequence?, remarks? }[]` — **→ PCB**, with **boards-per-unit qty** and
assembly order (a product may need >1 of the same board).

---

## 2. How entities connect

```
Product ──< pcbs[] (qty) >── PCB ──< lines[].componentId (qty) >── Component
                                                                │
                                     brandVariants[].brandId ───┤──> Brand
                                     offers[].brandId ──────────┘
                                     offers[].supplierId ──────────> Supplier
                                     offers[].brandId ─────────────> Brand
```

Relationship summary (all associations are **many-to-many** and carry attributes → they become join tables in SQL):

| Relationship | Join carries | Cardinality |
|---|---|---|
| Product ↔ PCB | `qty` (boards per unit), `sequence`, `remarks` | M:N via `product.pcbs`. **Backend: scoped to a `bom_versions` row and pinned to a `pcb_revisions` row** (§7d) |
| PCB ↔ Component | `qty` (per board), `refDes`, `preferredBrandId` (→ Brand), `remarks` | M:N via `pcb.lines`. **Backend: lines belong to a `pcb_revisions` row** (§7d) |
| Component ↔ Brand | `partNo`, `stock` (per-brand variant) | M:N via `component.brandVariants` |
| Component ↔ (Supplier × Brand) | `price`, `currency`, `moq`, `spq`, `leadTimeDays`, `valid_from/to` | **supplier_component_prices** — a time-bounded price-book row per (component, supplier, brand) |

**Derived (never stored) — computed by selectors in `src/mockdata/index.ts`:**
- `pcbBom(pcb)` → resolved BOM lines with full component records
- `pcbTotalParts`, `pcbBomValue`
- `productPcbList` (boards + per-unit qty + sequence), `productPcbs` (distinct boards), `productBom` (flattened product→PCB→component; **component qty per unit = `pcb_lines.qty` × `product_pcbs.qty`**), `productUniqueComponents`, `productTotalParts`, `productBrandCount`, `productEstimatedCost`
- `componentUsage(id)` → every `{product, pcb, qty}` that consumes a component (where-used)
- `productsUsingComponent`, `pcbsUsingComponent`, `productsUsingPcb`, `pcbUsedInLabels`
- `componentBrands`, `brandComponents`, `supplierComponents`, `supplierBrandIds`
- `cheapestOffer`, `fastestOffer`, `bestPrice`, `isSingleSupplier`, `componentStockStatus` (`Healthy|Low|Critical` from stock vs minStock), `componentStockValue`

> **Backend note:** these are exactly the endpoints/queries the UI needs. The front-end
> currently computes them client-side over the whole dataset; the backend should expose
> them as query params / sub-resources / computed fields so the client stops recomputing.

---

## 3. Transactional & analytics data (not canonical entities)

These live in `src/mockdata/{production,purchases,dashboard,reports}.ts`. They reference
the canonical entities by id/name and are the records a backend will own as **mutable tables**.

### ProductionOrder (`production.ts` → `PRODUCTION_ORDERS`)
`id` (e.g. `PO-001`), `product` (name), `qty`, `status` (`Draft|Ready|In Progress|Completed`).
Used by the Kanban board (`/production/orders`).

> The mock is just the **order header** (what the Kanban needs). In the backend a production
> order is a **lifecycle with child tables** — see §7b. Plan → allocate raw material →
> consume → complete are distinct stages, each with its own records and inventory effects.

### PurchaseRequest (`purchases.ts` → `PURCHASE_REQUESTS`)
`prId`, `componentId`, `componentName`, `brandId`, `brandName`, `supplierId`, `supplierName`,
`qty`, `totalCost` (string), `status`, `date` (ISO). The mock uses a simple status set; the
backend uses the **full approval lifecycle** enum (§7c / approval workflow).

> The mock flattens **one component per PR row** for the table. In the backend a PR is a
> **header + line items** (PR0001 → Resistor, LED, Capacitor) — see §7c. Same for POs.

### PurchaseOrder (`purchases.ts` → `PURCHASE_ORDERS`)
`poId`, `prId` (→ PurchaseRequest), `componentName`, `brandName`, `supplierName`,
`qty`, `totalCost`, `status` (`Sent|Dispatched|Completed`), `date`. **PO derives from a PR** (`prId` link),
and is likewise a **header + line items** (§7c).

### Derived helpers (production)
`READINESS_ITEMS` (component required vs available), `READINESS_SOURCING` / `RECOMMENDATIONS`
(sourcing options from a component's real `offers`), `PLANNER_SHORTAGES`. These are computed
from the canonical store — backend should compute equivalents (MRP/readiness).

### Dashboard (`dashboard.ts`) & Reports (`reports.ts`)
Mostly **derived KPIs** (product status, low stock, single-supplier risk, top consumed,
usage impact, inventory distribution counts) plus a few presentational logs
(`PRODUCTION_BLOCKERS`, `RECENT_ACTIVITIES`, `PURCHASE_SUMMARY`) and a yield time-series.

---

## 4. Route map & navigation

Sidebar groups (`src/components/app-sidebar.tsx`):

| Group | Screens |
|---|---|
| **Overview** | Dashboard `/`, Reports `/reports` |
| **Supply Chain** | Products (`/products/list`, `/products/structure`), PCB Management (`/pcb-management/list`, `/pcb-management/structure`), Components (`/components/list`, `/components/details`), Inventory (`/components/inventory`, `/components/usage`) |
| **Manufacturing** | Production (`/production/planner`, `/production/readiness`, `/production/orders`) |
| **Procurement** | Suppliers & Brands (`/suppliers/list`, `/suppliers/details`, `/brands/list`), Purchase (`/purchases/requests`, `/purchases/orders`) |
| **Footer** | Settings `/settings` |

Redirects: `/brands → /brands/list`, `/purchases → /purchases/requests`.
Also `/components/add` (create form) and `/products`, `/pcb-management`, `/components`, `/production`, `/suppliers` group-parent URLs (no standalone page).

---

## 5. Page-by-page breakdown

Legend — **Reads:** entities/selectors consumed. **Writes:** persistence. **Params:** URL query.
**Links:** outbound navigation to other screens.

### Dashboard — `/` (`app/page.tsx`)
- **Reads:** `@/mockdata/dashboard` (PRODUCT_STATUS, LOW_STOCK, SINGLE_SUPPLIER, TOP_CONSUMED, USAGE_IMPACT, INVENTORY_CHART, + static panels). Tabs: Overview / Manufacturing / Inventory / Procurement.
- **Links:** quick-links to components (list/add/inventory), production/planner, purchases/requests, suppliers/list, pcb-management/list, reports; blockers → purchases/requests; low-stock & risk → components/list.
- **Backend:** a `/dashboard/summary` aggregate endpoint (counts, low-stock, single-supplier, top-consumed, product build status).

### Products List — `/products/list`
- **Reads:** `PRODUCTS` + `productUniqueComponents`, `productBrandCount`. Client search + status filter.
- **Links:** each card → `/products/structure?product={id}`.

### Product Structure — `/products/structure?product={id}`
- **Reads:** `getProduct`, `productPcbs`, `pcbBom`, `productUniqueComponents`, `productTotalParts`, brand/supplier lookups. Tree view + Excel/BOM view (flatten product→PCB→component). Build-qty calculator scales quantities.
- **Params:** `product`. **Exports:** `.xls` via `src/lib/export-excel.ts`.
- **Links:** back → `/products/list`; component drawer → `/components/details?component=`, `/brands/list?brand=`, `/suppliers/details?supplier=`.

### PCB List — `/pcb-management/list`
- **Reads:** `PCBS` + `pcbUsedInLabels`. Search + status filter, summary stats.
- **Links:** each card → `/pcb-management/structure?pcb={id}`.

### PCB Structure — `/pcb-management/structure?pcb={id}`
- **Reads:** `getPcb`, `pcbBom`, `componentBrands`, `bestPrice`, `componentStockStatus`, `productsUsingPcb`, supplier lookups. Tree + Excel/BOM views, build calculator, component detail drawer.
- **Params:** `pcb`. **Exports:** `.xls`.
- **Links:** back → `/pcb-management/list`; brands `/brands/list?brand=`; drawer → `/components/details?component=`, `/suppliers/details?supplier=`.

### Component List — `/components/list`
- **Reads:** `COMPONENTS` mapped via `cheapestOffer/fastestOffer/isSingleSupplier/componentUsage`. Advanced multi-field search + 6 filters (category, solder, brand, supplier, stock status, footprint). Row → slide-out spec drawer.
- **Params:** `component` (auto-opens drawer).
- **Links:** `/components/add`, `/components/details?component=`.

### Component Details — `/components/details?component={id}`
- **Reads:** `COMPONENTS` mapped to a rich detail (variants, suppliers, where-used tree, usage table, specs, procurement insight).
- **Writes:** `localStorage["mockup2_erp_components_details"]` (edit price / add supplier / add variant / edit / delete).
- **Params:** `component`. **Links:** `/brands/list?brand=`, `/suppliers/details?supplier=`, `/components/list`.

### Inventory — `/components/inventory`
- **Reads:** `COMPONENTS` → `{stock, minStock, reorderQty, unitCost=bestPrice, bin, lastCount, brands, suppliers, usedIn}`. Status = derived; value = stock × unitCost. Search + category + status filters.

### Usage Analysis — `/components/usage`
- **Reads:** `COMPONENTS` → `{usedInProductsCount, usedInPCBsCount, annualConsumption, currentStock, coverageDays}` + a deterministic 12-month trend (from `annualConsumption`).

### Component Add — `/components/add`
- **Form only** (create). Example default rows; **not** wired to the store. Submitting should `POST /components`.

### Brand List / Dashboard — `/brands/list?brand={id}`
- **Reads:** `BRANDS` seeded via `brandComponents` + offers → components & suppliers per brand.
- **Writes:** `localStorage["mockup2_erp_brands_data"]` (add brand / link component / map supplier).
- **Params:** `brand`. **Links:** `/components/details?component=`, `/suppliers/details?supplier=`.

### Supplier List — `/suppliers/list`
- **Reads:** `SUPPLIERS`. **Links:** `/suppliers/details?supplier={id}`.

### Supplier Details — `/suppliers/details?supplier={id}`
- **Reads:** `SUPPLIERS` seeded via `supplierComponents`/offers → parts catalog, `supplierBrandIds`, `productsUsingComponent` → products impacted.
- **Writes:** `localStorage["mockup2_erp_suppliers_details"]` (map component).
- **Params:** `supplier`. **Links:** `/components/details?component=`, `/brands/list?brand=`.

### Production Planner — `/production/planner`
- **Reads:** `PLANNER_SHORTAGES` (derived); product dropdown (ROIP 400 / Voice Logger), multi-step MRP wizard (mostly presentational).
- **Writes:** generates Purchase Requests (localStorage).

### Production Readiness — `/production/readiness`
- **Reads:** `READINESS_ITEMS`, `READINESS_SOURCING`, `READINESS_MISSING_QTY`, `READINESS_SHORT_COMPONENT` (all derived from component stock vs a simulated ROIP 400 batch).
- **Writes:** creates a PR into `localStorage["mockup2_erp_purchase_requests"]`.

### Production Orders — `/production/orders`
- **Reads:** `PRODUCTION_ORDERS`. Drag-and-drop Kanban across statuses (in-memory only today).

### Purchase Requests — `/purchases/requests`
- **Reads:** `PURCHASE_REQUESTS`, `RECOMMENDATIONS` (from Resistor 10K offers).
- **Writes:** `localStorage["mockup2_erp_purchase_requests"]`. Approving a PR conceptually creates a PO.

### Purchase Orders — `/purchases/orders`
- **Reads:** `PURCHASE_ORDERS` (each has `prId` → PR).
- **Writes:** `localStorage["mockup2_erp_purchase_orders"]`.

### Reports — `/reports`
- **Reads:** `PRODUCTION_YIELD` time-series + static KPI stats + product distribution.

### Settings — `/settings`
- Static form (no data).

### Universal Search (`src/components/universal-search.tsx`)
- **Reads:** `src/lib/search-data.ts`, which is now **fully derived from `@/mockdata`** (products, PCBs, components, brands, suppliers). Global command-palette search across all entities.

---

## 6. Client persistence to replace with the backend

| localStorage key | Written by | Becomes |
|---|---|---|
| `mockup2_erp_components_details` | Component Details edits | `PATCH/POST /components/{id}` (+ variants, supplier_component_prices) |
| `mockup2_erp_brands_data` | Brand List | `POST /brands`, brand↔component / brand↔supplier links |
| `mockup2_erp_suppliers_details` | Supplier Details | `POST /suppliers/{id}/prices` |
| `mockup2_erp_purchase_requests` | Purchase Requests, Production Readiness, Planner | `POST /purchase-requests` |
| `mockup2_erp_purchase_orders` | Purchase Orders | `POST /purchase-orders` |

Production Orders (Kanban) is currently in-memory only → back it with `PATCH /production-orders/{id}` on drag.

---

## 7. Proposed backend contract

> **The full runnable PostgreSQL DDL is in [`docs/schema.sql`](schema.sql)**, organized by
> module: **Authentication** (users, roles, permissions) · **Masters** (categories, brands,
> suppliers, warehouses, components, pcbs, products) · **Relationships** (product_pcbs, pcb_lines,
> component_specs, component_brand_variants, supplier_component_prices) · **Inventory**
> (inventory, inventory_transactions) · **Production** (production_orders, _items, allocations,
> consumptions) · **Purchase** (purchase_requests/_items, purchase_orders/_items, goods_receipts).
> The sections below are the conceptual contract; `schema.sql` is the source of truth for columns,
> types, constraints, and triggers.

### Conventions — audit columns & soft delete (ALL tables)

Every table carries these standard columns (omitted from the definitions below to cut noise):
```
created_by, updated_by   -> users(id)     -- who
created_at, updated_at    -- when (updated_at bumped on every write)
deleted_at                -- soft delete: NULL = active, non-NULL = archived
```
- **Never hard-DELETE.** Set `deleted_at`; every read filters `WHERE deleted_at IS NULL`.
- **Unique constraints must be soft-delete-aware** — use a partial unique index
  `... WHERE deleted_at IS NULL`, so archiving a row doesn't block re-creating an active one
  (applies to all the `UNIQUE(...)` shown later).
- **Exception — append-only ledgers are immutable:** `inventory_transactions` (§7a) keeps only
  `created_by` / `created_at`; it has **no `updated_*` and no `deleted_at`**. Corrections are
  *reversing entries* (an opposite `ADJUSTMENT`), never edits or deletes.
- `users` (id, name, email, role, …) is assumed for the `*_by` FKs and isn't detailed here.

### Core tables (normalized)

> **Stock is NOT stored on catalog tables.** `components.stock` and
> `component_brand_variants.stock` in the front-end mock are display conveniences only.
> In the backend, on-hand quantity lives in **one place — the Inventory module** (§7a),
> keyed by brand variant + warehouse. Everything else (a component's total stock, a
> variant's stock, low-stock flags) is **derived** from it. See §7a.

```
products(id, name, code, version, description, status, estimated_cost, buildable_qty*)
pcbs(id, name, description, layers, status, components_count)          -- stock_count is derived (finished-goods inventory)
components(id, generic_pn, name, category, description, min_stock,
           reorder_qty, unit, solder_type, footprint, spq, annual_consumption)
           -- NO stock/bin/last_count here — those are inventory concerns
brands(id, name, description, headquarter, founded, status, rating)
suppliers(id, name, description, contact, email, phone, address, terms, rating, status)

-- join / child tables
product_pcbs(id, product_id, pcb_id, qty, sequence, remarks)       -- M:N; boards per unit
pcb_lines(id, pcb_id, component_id, qty, ref_des, preferred_brand_id, remarks)  -- BOM; parts per board
                                                                   -- preferred_brand_id -> brands(id)
component_specs(id, component_id, key, value, display_order)      -- ORDER BY display_order for stable UI
component_brand_variants(id, component_id, brand_id, part_no)      -- M:N + attrs; surrogate id, NO stock
-- supplier price book (renamed from "component_offers" — that's what it is).
-- Prices change often, so each row is time-bounded; the "current" price is the row
-- valid today. Keep history rather than overwriting.
supplier_component_prices(
  id, component_id, supplier_id, brand_id,
  price, currency,                 -- e.g. 'INR'
  moq,                             -- supplier minimum order qty
  spq,                             -- supplier pack qty (may differ from component.spq)
  lead_time_days,
  valid_from, valid_to,            -- validity window; valid_to NULL = current/open
  UNIQUE(component_id, supplier_id, brand_id, valid_from)
)

-- transactional
production_orders(id, product_id, qty, status, target_date, created_at)  -- header; see §7b for children
purchase_requests(id, status, requested_by, date, remarks, total_cost)   -- header; see §7c
purchase_orders(id, pr_id, supplier_id, status, date, total_cost)         -- header; see §7c
```

### 7c. Purchase request / order lines (header + items)

PRs and POs are **documents with line items**, exactly like a real ERP. A PR (PR0001) lists
several components; when approved it is **sourced into one PO per supplier** (a PR spanning two
suppliers splits into two POs).

```
purchase_requests(id, status, requested_by, date, remarks, total_cost)   -- header
purchase_request_items(
  id, purchase_request_id, component_id,
  brand_id,            -- desired brand (optional)
  supplier_id,         -- recommended supplier (optional; finalized at PO)
  qty, unit_price, line_total, required_by
)

purchase_orders(id, pr_id, supplier_id, status, date, total_cost)         -- header; ONE supplier per PO
purchase_order_items(
  id, purchase_order_id,
  pr_item_id           -> purchase_request_items(id),   -- traceability PR line → PO line
  component_id, brand_id, qty, unit_price, line_total
)
```
- Header carries status/dates/totals; **items carry the components** (what & how much).
- `total_cost` on the header = Σ line totals (derived; store or compute).
- PO receipts feed the **Inventory ledger** (`inventory_transactions(type='IN')`, §7a) — the
  goods-in step; stock is never written directly, only via a transaction.

**Approval workflow.** `purchase_requests.status` is a full lifecycle enum, designed ahead of the
UI so no migration is needed when approvals go live:
```
Draft → Submitted → Manager Approved → Procurement Approved → PO Created
                 ↘ Rejected            (Cancelled is a terminal branch from any pre-PO state)
```
- Each decision is recorded in a generic **`approvals`** audit table
  (`entity_type, entity_id, step, seq, decision, decided_by, decided_at, comment`) — polymorphic,
  so the same mechanism later covers production orders, BOM releases, etc.
- `PO Created` is reached only from `Procurement Approved`, and is what triggers the
  PR→PO sourcing (`/purchase-requests/{id}/approve`). `Rejected` routes back to the requester.
- The front-end mock keeps a simpler status set (`Pending Approval`, `Approved`) — it's a display
  stand-in for this lifecycle.

### 7b. Production order lifecycle (child tables)

One order header, three child stages. Each stage has different records and different
inventory effects (§7a) — don't collapse them into the header.

```
-- STAGE 1 — PLAN: BOM demand exploded for the order (what it needs)
production_order_items(
  id, production_order_id, component_id,
  required_qty,        -- = pcb_lines.qty × product_pcbs.qty × production_orders.qty
  status               -- pending | allocated | consumed | short
)

-- STAGE 2 — ALLOCATE: reserve specific inventory to each item (available → reserved)
production_order_allocations(
  id, production_order_item_id,
  component_brand_variant_id  -> component_brand_variants(id),
  warehouse_id                -> warehouses(id),
  allocated_qty, allocated_at
)   -- adjusts `reserved` in the projection; NOT a ledger transaction

-- STAGE 3 — CONSUME: issue what was actually used on the floor (reserved → issued)
production_order_consumptions(
  id, production_order_item_id, allocation_id,
  component_brand_variant_id, warehouse_id,
  consumed_qty, consumed_at
)   -- appends inventory_transactions(type='CONSUMPTION')

-- STAGE 4 — COMPLETE: order status → Completed; finished units append
--            inventory_transactions(type='PRODUCTION') to the finished-goods warehouse.
```

**Lifecycle & inventory linkage:**
```
Draft ─plan→ Ready ─allocate→ (reserved) ─consume→ In Progress ─finish→ Completed
             items         allocations              consumptions      finished-goods receipt
```
- **Allocate** never moves physical stock — it shifts `available → reserved` (§7a). Shortages
  (required_qty > allocatable) surface here (item.status = `short`) and drive the readiness/PR flow.
- **Consume** decrements the reservation as parts hit the line (`reserved → issued`); actuals
  (consumed) can differ from planned (required) — that variance is a real report.
- **Complete** produces finished goods into the finished-goods warehouse and closes the order.

\* `buildable_qty` is also derived (min over BOM of `available ÷ qty-per-unit`), not stored.

### 7a. Inventory module — append-only ledger (single source of truth)

> **The golden rule: never UPDATE stock directly. Every change is an appended
> `inventory_transactions` row.** Stock levels are a *projection* of that ledger, so the
> books always reconcile and you get a full audit trail for free.

Quantity is tracked per **brand variant × warehouse**.
```
warehouses(id, name, code, location)

-- THE LEDGER — the source of truth. Immutable, append-only.
inventory_transactions(
  id,
  type,                          -- IN | OUT | TRANSFER | ADJUSTMENT | RETURN | CONSUMPTION | PRODUCTION
  component_brand_variant_id  -> component_brand_variants(id),
  warehouse_id                -> warehouses(id),   -- destination (for TRANSFER)
  from_warehouse_id,          -- source; set only for TRANSFER
  qty_delta,                     -- signed: +in / −out
  ref_type, ref_id,              -- source doc, e.g. ('purchase_order','PO-984302'), ('production_order','PO-001')
  reason, note, created_at, created_by
)

-- READ-MODEL (projection of the ledger + open allocations). Rebuildable; never hand-edited.
inventory_balances(
  component_brand_variant_id, warehouse_id,
  on_hand,          -- = Σ inventory_transactions.qty_delta
  reserved,         -- = Σ open production_order_allocations
  available,        -- = on_hand − reserved
  damaged,          -- from ADJUSTMENT/RETURN into a damaged bucket
  bin, last_counted_at,
  UNIQUE(component_brand_variant_id, warehouse_id)
)
```

**Transaction types**
| type | direction | typical source |
|---|---|---|
| `IN` | + | PO goods-receipt, opening stock |
| `OUT` | − | manual issue / write-off / sale |
| `TRANSFER` | ±  | move between warehouses (source `from_warehouse_id` −, dest `warehouse_id` +) |
| `ADJUSTMENT` | ± | cycle-count correction (physical vs system) |
| `RETURN` | ± | return to supplier (−) or return from floor (+) |
| `CONSUMPTION` | − | issued to a production order (build) |
| `PRODUCTION` | + | finished goods produced into stock |

**Derivation rules (compute, never store as the truth):**
```
variant on-hand (one warehouse) = Σ inventory_transactions.qty_delta
variant on-hand (all)           = Σ across warehouses
component current stock          = Σ on-hand over the component's brand variants
reserved                        = Σ open production_order_allocations  (§7b)
available                       = on_hand − reserved
low / critical                  = current stock vs components.min_stock
```
Reservations (allocate/release, §7b) affect **`reserved`** only — they are *not* physical
transactions and never appear in the ledger; they just move `available ↔ reserved` in the
projection. Physical movement happens at **CONSUMPTION** (build issue) and **PRODUCTION**
(finished-goods in).

> Apply the same ledger to **finished goods**: `pcbs.stock_count` and product stock are
> `inventory_transactions` (type `PRODUCTION` in, `OUT` on dispatch) against a finished-goods
> warehouse — never columns on the catalog.

### 7d. BOM versioning (product BOM version + PCB revision)

Engineering revises BOMs over time. There are **two independent version axes** — collapse them
and you either lose PCB reuse or can't reconstruct what a product looked like at v1.0.

- **`pcb_revisions`** (Rev A, Rev B) — a board's lines (`pcb_lines`) belong to a *revision*, so a
  PCB evolves while staying one reusable master (Audio PCB is shared by ROIP 400 & Dispatcher;
  its lines are never duplicated per product).
- **`bom_versions`** (v1.0, v1.1) — a product BOM version selects which PCB *revisions* it uses;
  `product_pcbs` are scoped to a `bom_version_id` and pin a specific `pcb_revision_id`.

```
bom_versions(id, product_id, version, status, effective_from, effective_to)
pcb_revisions(id, pcb_id, rev, status, effective_from, effective_to)
product_pcbs(id, bom_version_id → bom_versions, pcb_revision_id → pcb_revisions, qty, sequence, remarks)
pcb_lines(id, pcb_revision_id → pcb_revisions, component_id, qty, ref_des, preferred_brand_id, remarks)
```
```
ROIP400 v1.0 → Audio PCB Rev A → (its pcb_lines)
ROIP400 v1.1 → Audio PCB Rev B → (revised pcb_lines)
```
- `status` = `Draft | Active | Superseded | Obsolete`, plus `effective_from/to`. **At most one
  Active version per product** and one Active revision per PCB (partial unique indexes).
- **Resolving "the current BOM":** product's Active `bom_versions` → its `product_pcbs` → each
  `pcb_revision` → that revision's `pcb_lines`. The front-end `productBom` / `pcbBom` selectors
  model exactly this current-resolution (the mock holds only the active BOM).
- **Production traceability:** `production_orders.bom_version_id` snapshots which version a batch
  was built against — a completed order always reflects its as-built BOM even after a newer
  version is released.

### 7e. Notifications

A lightweight per-user feed for events that already exist in the UI (production shortages,
low stock, approval requests). Append + mark-read; no soft-delete needed.
```
notifications(id, user_id, type, title, body, ref_type, ref_id, is_read, read_at, created_at)
  type = shortage | low_stock | approval_request | approval_result | po_created | system
  ref_type/ref_id = optional deep link to the source entity
```
Producers map cleanly to existing signals: readiness/planner shortage → `shortage`; a component
crossing `min_stock` (an `OUT`/`CONSUMPTION` ledger write) → `low_stock`; PR `Submitted` →
`approval_request` to the approver. Partial index on `(user_id) WHERE is_read = false` keeps the
unread badge cheap.

### Suggested REST endpoints (mirror current UI reads)
```
GET  /products            /products/{id}        /products/{id}/bom      -> flattened BOM (productBom)
GET  /products/{id}/bom               ?version=1.1                      -- specific version (default: Active)
GET  /products/{id}/versions          POST /products/{id}/versions      -- bom_versions (list / new draft)
GET  /pcbs                /pcbs/{id}            /pcbs/{id}/bom          -> pcbBom + totals
GET  /pcbs/{id}/revisions             POST /pcbs/{id}/revisions         -- pcb_revisions (list / new rev)
GET  /components          ?category&solderType&brand&supplier&stockStatus&footprint&q
GET  /components/{id}                            /components/{id}/usage  -> where-used (componentUsage)
GET  /components/{id}/stock                       -- rolled up {available, reserved, damaged, onHand, byWarehouse[]}
GET  /brands              /brands/{id}          /brands/{id}/components
GET  /suppliers           /suppliers/{id}       /suppliers/{id}/prices   -- supplier_component_prices
GET  /dashboard/summary                          -- KPIs, low-stock, single-supplier, product status

-- Inventory module (append-only ledger; never write stock directly)
GET  /warehouses
GET  /inventory                        ?componentId&variantId&warehouseId   -- balances (projection)
POST /inventory/transactions                     -- IN | OUT | TRANSFER | ADJUSTMENT | RETURN | CONSUMPTION | PRODUCTION
GET  /inventory/transactions           ?variantId&warehouseId&type&from&to  -- ledger / audit trail
GET  /reports/yield?range=6m
POST /production-orders    PATCH /production-orders/{id}       -- header + status transitions
GET  /production-orders/{id}/items                             -- STAGE 1 plan (BOM demand)
POST /production-orders/{id}/allocations                       -- STAGE 2 reserve inventory
POST /production-orders/{id}/consumptions                      -- STAGE 3 issue to build
POST /production-orders/{id}/complete                          -- STAGE 4 finished-goods receipt + close
POST /purchase-requests    PATCH /purchase-requests/{id}    -- header
POST /purchase-requests/{id}/items                          -- PR line items
POST /purchase-requests/{id}/submit                         -- Draft → Submitted
POST /purchase-requests/{id}/decision                       -- Manager/Procurement approve or reject (writes `approvals`)
POST /purchase-requests/{id}/approve                        -- (Procurement Approved) sources into PO(s), one per supplier

-- Approvals & notifications
GET  /approvals            ?entityType&entityId              -- audit trail for a document
GET  /notifications        ?unread=true                      -- current user's feed
POST /notifications/{id}/read      POST /notifications/read-all
POST /purchase-orders      PATCH /purchase-orders/{id}      -- header
POST /purchase-orders/{id}/items                            -- PO line items
POST /purchase-orders/{id}/receipts                         -- goods-in → inventory receipt (§7a)
POST /components           POST /components/{id}/prices        -- + variants (supplier_component_prices)
GET  /components/{id}/prices          ?asOf=YYYY-MM-DD          -- price book; defaults to current (valid today)
```

### Computed fields the API should return (so the client stops deriving)
- component: `stock` (= available + reserved, from inventory), `available`, `reserved`, `damaged`, `stockStatus`, `bestPrice`, `isSingleSupplier`, `cheapestOffer`, `fastestOffer`, `coverageDays`
- brand variant: `stock` (rolled up from inventory) — never a stored column
- pcb: `totalParts`, `bomValue`, `stockCount` (finished-goods inventory), `usedInProducts`
- product: `uniqueComponentsCount`, `totalComponents`, `brandCount`, `estimatedCost`, `buildableQty`

> Every `stock`/`available` number the UI shows is a **read-model projection** of the
> inventory + movements tables. No catalog table stores a quantity.

### Money & dates
Store `price` / `estimated_cost` as numbers (minor units or decimal), `lead_time_days` as int,
dates as ISO. Formatting (`₹`, "3 Days") stays in the UI.

---

## 8. Quick reference — entity → screens that touch it

| Entity | Read on | Mutated on |
|---|---|---|
| Component | components/list, details, inventory, usage; product & PCB structure; dashboard; search | components/add, components/details |
| Inventory (stock) | components/inventory, usage; component details; product/PCB structure; dashboard; production/readiness | inventory movements (receipt/issue/reserve/adjust) |
| Brand | brands/list; component details; product/PCB structure; search | brands/list |
| Supplier | suppliers/list, details; component details; product/PCB structure; search | suppliers/details |
| PCB | pcb-management/list, structure; products/structure; search | — (seeded only) |
| Product | products/list, structure; dashboard; planner; search | — (seeded only) |
| ProductionOrder | production/orders; dashboard | production/orders |
| PurchaseRequest | purchases/requests; dashboard | purchases/requests, production/readiness, planner |
| PurchaseOrder | purchases/orders | purchases/orders |
