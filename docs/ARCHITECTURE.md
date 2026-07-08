# StackIOT ERP — UI Structure & Data Architecture

> Reference for backend design. Describes every screen, the data each one reads/writes,
> the entity model behind the UI (`src/mockdata`), how entities link, and a proposed
> backend contract that mirrors the current front-end shapes.

**Stack:** Next.js 16.2.9 (App Router, all pages `"use client"` except redirects), React 19,
Tailwind v4, shadcn/base-ui components, `recharts` for charts, `lucide-react` icons.
**Persistence today:** no server — canonical data is in-memory (`src/mockdata`), and several
pages cache user edits in `localStorage`. Two subsystems are already prototyped client-side and
mirror the backend design below: the **inventory ledger** (`src/mockdata/transactions.ts` +
`src/lib/stock-ledger.ts`, see §7a) and the **module-licensing toggles** (`src/lib/modules.ts`,
see §4). The backend replaces all of it.

---

## 1. Domain model (source of truth: `src/mockdata`)

Five **canonical entities**. Everything references everything else by `id`. Entity/type
definitions live in `src/mockdata/types.ts`; each entity has its own seed file
(`components.ts`, `brands.ts`, …), selectors live in `index.ts`, and two non-entity files back
the prototyped subsystems: `transactions.ts` (inventory ledger, §7a) and `launchpad.ts`
(home-screen tiles, §4).

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
| `specs` | `{ key, value }[]` | Free-form spec sheet; **order-significant** (array position = display order; backend stores it as an ordered `components.specs` jsonb array) |
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

These live in `src/mockdata/{production,purchases,dashboard,reports,transactions}.ts`. They
reference the canonical entities by id/name and are the records a backend will own as **mutable
tables**.

> **`transactions.ts` (StockTransaction)** is the one that's more than a display stub — it seeds
> a real append-only inventory ledger (`{componentId, brandId, supplierId?, direction, qty,
> date, note}`) that the Inventory page reads and appends to. It's the front-end prototype of
> §7a's `inventory_transactions`; stock shown in the UI is derived from it, not from
> `component.stock`. See §5 (Inventory) and §7a.

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

## 4. Route map, navigation & module licensing

**Hub-and-spoke, no sidebar** (deliberate). The shell (`src/app/layout.tsx`) is a chrome bar
(`components/top-bar.tsx`) + a contextual tab strip (`components/workspace-tabs.tsx`) wrapping
the page. `/` is the **Launchpad** (`app/page.tsx` → `components/launchpad.tsx`): a tile grid of
workspaces you launch into. Everything is driven by two registries in **`src/lib/modules.ts`** —
never hard-coded per screen.

### Workspaces (`WORKSPACES`)
Each workspace is a top-bar entry with an entry `href` and zero or more `tabs`. A workspace with
an empty `tabs` array renders no tab strip (single-page). `workspaceForPath` / `activeTabHref`
resolve the current path to the active workspace + tab (most-specific href wins, so
`/components/inventory` → Inventory while `/components/list` → Components).

| Workspace | `moduleId` (lock) | Entry | Tabs |
|---|---|---|---|
| **Dashboard** | — (free) | `/dashboard` | *(single page)* |
| **Components** | — (free) | `/components/list` | Component List, Component Details (`/components/details`), Add Component (`/components/add`) |
| **Inventory & Stock** | `inventory` | `/components/inventory` | Inventory, Usage Analysis (`/components/usage`) |
| **Products** | — (free) | `/products/list` | Product List, Product Structure (`/products/structure`, tab-gated by `bom`) |
| **PCB Management** | — (free) | `/pcb-management/list` | PCB List, PCB Structure (`/pcb-management/structure`, tab-gated by `bom`) |
| **Production** | `production` | `/production/planner` | Planner, Readiness, Orders |
| **Purchasing** | `purchasing` | `/purchases/requests` | Requests, Orders (`/purchases/orders`) |
| **Suppliers & Brands** | — (free) | `/suppliers/list` | Suppliers, Supplier Details (`/suppliers/details`), Brands (`/brands/list`) |
| **Reports & Analytics** | `reports` | `/reports` | *(single page)* |

`/settings` sits outside the workspace registry (chrome-level). Redirects: `/brands →
/brands/list`, `/purchases → /purchases/requests`. Group-parent URLs `/products`,
`/pcb-management`, `/components`, `/production`, `/suppliers` have no standalone page.

### Module licensing (`MODULES`, `BASE_AREAS`)
The ERP is sold per module: a **free base tier** (`BASE_AREAS` — Components, Products, PCB
Management, Suppliers & Brands) plus **5 toggleable paid modules** (`MODULES`): `inventory`,
`bom`, `purchasing`, `production`, `reports`. Each module owns `routePrefixes`; `moduleForPath`
maps any path to its owning module (or null for free routes).

- **Enable state** lives in `localStorage[mockup2_erp_enabled_modules]` (`DEFAULT_ENABLED` = all
  on), managed by `components/module-provider.tsx` (`useModules`) and toggled from Settings via
  `components/modules-settings-card.tsx`.
- **Gating:** `components/module-gate.tsx` blocks a locked module's routes; the Launchpad shows
  locked tiles as unavailable; `workspace-tabs` hides workspaces/tabs whose `moduleId` is off
  (e.g. Product/PCB Structure tabs disappear when `bom` is off, but the list pages stay — those
  are free base areas).
- **Backend mapping:** this is presentational today. The real system becomes a per-tenant
  license/entitlement check; `moduleForPath` is the front-end analog of a route-level permission
  guard.

---

## 5. Page-by-page breakdown

Legend — **Reads:** entities/selectors consumed. **Writes:** persistence. **Params:** URL query.
**Links:** outbound navigation to other screens.

### Launchpad — `/` (`app/page.tsx`)
- **Reads:** `WORKSPACES` / `MODULES` / `BASE_AREAS` (`src/lib/modules.ts`) + `useModules` for lock state; tile copy from `@/mockdata/launchpad`. Home screen — a tile grid that launches into each workspace; locked (unlicensed) modules render as unavailable.
- **Links:** each tile → its workspace entry `href`.

### Dashboard — `/dashboard` (`app/dashboard/page.tsx`)
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

### Inventory — `/components/inventory` *(module: `inventory`)*
- **Reads:** the **client-side stock ledger** via `useStockLedger` (`src/lib/use-stock-ledger.ts`), which seeds from `buildSeedTransactions()` and hydrates from `localStorage`. Stock is **derived from the ledger** — `effectiveComponentStock` / `effectiveBrandStocks` (`src/lib/stock-ledger.ts`) — not read off `component.stock`. Per-component detail shows a running-balance transaction history (`componentTxns` → `LedgerRow`). Other fields (`minStock, reorderQty, unitCost=bestPrice, bin, lastCount, brands, suppliers, usedIn`) still come from `COMPONENTS`. Status = derived; value = stock × unitCost. Search + category + status filters.
- **Writes:** appends `StockTransaction`s (`addTransaction`, IN/OUT movements) to `localStorage["mockup2_erp_stock_transactions"]`. This is the front-end prototype of §7a's append-only ledger.

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
- **Reads/Writes:** `ModulesSettingsCard` (`components/modules-settings-card.tsx`) toggles the licensed modules via `useModules` → `localStorage["mockup2_erp_enabled_modules"]` (§4). Remainder is a static form (no data).

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
| `mockup2_erp_stock_transactions` | Inventory (stock movements) | `POST /inventory/transactions` (append-only ledger, §7a) |
| `mockup2_erp_enabled_modules` | Settings (module toggles) | per-tenant license / entitlement service (§4) |

Production Orders (Kanban) is currently in-memory only → back it with `PATCH /production-orders/{id}` on drag.

---

## 7. Proposed backend contract

> **The full runnable PostgreSQL DDL is in [`docs/schema.sql`](schema.sql)**, organized by
> module: **Tenancy** (companies) · **Authentication** (users, company_memberships, roles,
> role_permissions) · **Masters** (brands, suppliers, warehouses, storage_locations, components,
> pcbs, products) · **Relationships** (product_pcbs, pcb_lines, component_brand_variants,
> supplier_component_prices) · **Inventory** (inventory_balances, inventory_transactions) · **Production**
> (production_orders, _items, production_material_moves) · **Purchase** (purchase_requests/_items,
> purchase_orders/_items) · **Workflow/logs** (approvals, notifications, audit_logs). The sections
> below are the conceptual contract; `schema.sql` is the source of truth for columns, types,
> constraints, and triggers. **30 tables total.**

> **The system is multi-tenant** — one installation serves many companies. This is the
> highest-priority structural axis and is described in **§7f**; it touches nearly every table
> (`company_id`), so it is designed in from the start rather than retrofitted.

### Conventions — tenancy, audit columns & soft delete (ALL tables)

Every **tenant-owned** table carries these standard columns (omitted from the definitions below
to cut noise):
```
company_id               -> companies(id) -- tenant owner (NOT NULL); see §7f
created_by, updated_by   -> users(id)     -- who
created_at, updated_at    -- when (updated_at bumped on every write)
deleted_at                -- soft delete: NULL = active, non-NULL = archived
```
- **`company_id` is on every table except the three global ones** (`companies`, `users`,
  `permissions`). It's set on insert and never changes. See §7f for the full tenancy model.
- **Never hard-DELETE.** Set `deleted_at`; every read filters `WHERE deleted_at IS NULL`.
- **Unique constraints must be soft-delete-aware** — use a partial unique index
  `... WHERE deleted_at IS NULL`, so archiving a row doesn't block re-creating an active one
  (applies to all the `UNIQUE(...)` shown later).
- **Exception — append-only ledgers are immutable:** `inventory_transactions` (§7a) keeps only
  `created_by` / `created_at`; it has **no `updated_*` and no `deleted_at`**. Corrections are
  *reversing entries* (an opposite `ADJUSTMENT`), never edits or deletes.
- `users` (id, name, email, role, …) is assumed for the `*_by` FKs and isn't detailed here.

### Core tables (normalized)

> **Every table below also carries `company_id` (§7f) + the audit columns** — omitted here to
> keep the shapes readable. `companies`, `users`, and `permissions` are the only tables without
> `company_id`.

> **Stock is NOT stored on catalog tables.** `components.stock` and
> `component_brand_variants.stock` in the front-end mock are display conveniences only.
> In the backend, on-hand quantity lives in **one place — the Inventory module** (§7a),
> keyed by brand variant + bin (§7g). Everything else (a component's total stock, a
> variant's stock, low-stock flags) is **derived** from it. See §7a.

```
products(id, name, code, version, description, status, estimated_cost, buildable_qty*)
pcbs(id, name, description, layers, status, components_count)          -- stock_count is derived (finished-goods inventory)
components(id, generic_pn, name, category, description, min_stock,
           reorder_qty, unit, solder_type, footprint, spq, annual_consumption,
           specs)   -- category = plain label; specs = ordered [{key,value}] jsonb
           -- NO stock/bin/last_count here — those are inventory concerns
brands(id, name, description, headquarter, founded, status, rating)
suppliers(id, name, description, contact, email, phone, address, terms, rating, status)

-- join / child tables
product_pcbs(id, product_id, pcb_id, qty, sequence, remarks)       -- M:N; boards per unit
pcb_lines(id, pcb_id, component_id, qty, ref_des, preferred_brand_id, remarks)  -- BOM; parts per board
                                                                   -- preferred_brand_id -> brands(id)
-- (component specs are an ordered jsonb array on components.specs, not a table)
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

One order header, one demand table, and one material-moves table (allocations and consumptions
are two `kind`s of the same row — merged to keep the schema lean without losing the stage
distinction, which is now the `kind` column + `released_at`).

```
-- STAGE 1 — PLAN: BOM demand exploded for the order (what it needs)
production_order_items(
  id, production_order_id, component_id,
  required_qty,        -- = pcb_lines.qty × product_pcbs.qty × production_orders.qty
  status               -- pending | allocated | consumed | short
)

-- STAGE 2/3 — MATERIAL MOVES: reservations and issues in one table, keyed by `kind`
production_material_moves(
  id, production_order_item_id, kind,   -- kind = 'allocation' | 'consumption'
  component_brand_variant_id  -> component_brand_variants(id),
  warehouse_id, location_id,            -- reserve-from / issue-from bin (§7g)
  qty, released_at, moved_at
)   -- kind='allocation'  → adjusts `reserved` in the projection (released_at frees it); NOT a ledger txn
    -- kind='consumption' → appends inventory_transactions(type='CONSUMPTION')

-- STAGE 4 — COMPLETE: order status → Completed; finished units append
--            inventory_transactions(type='PRODUCTION') to the finished-goods warehouse.
```

**Lifecycle & inventory linkage:**
```
Draft ─plan→ Ready ─allocate→ (reserved) ─consume→ In Progress ─finish→ Completed
             items      moves(kind=allocation)   moves(kind=consumption)  finished-goods receipt
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

> **Already prototyped client-side.** The front-end implements a simplified version of this
> ledger today: `StockTransaction` rows (`src/mockdata/transactions.ts`) with `IN`/`OUT`
> movements, a deterministic seed whose per-brand totals reconcile to the catalog, and
> derivation helpers (`effectiveComponentStock`, `effectiveBrandStocks`, `componentTxns` running
> balance) in `src/lib/stock-ledger.ts`. The mock is keyed by `component + brand` (no warehouse
> dimension yet) and has only `IN`/`OUT` (no `TRANSFER`/`ADJUSTMENT`/`CONSUMPTION`/`PRODUCTION`).
> The backend generalizes it to brand-variant × warehouse with the full type enum below.

Quantity is tracked per **brand variant × bin** — the bin being the leaf of the
**Warehouse → Zone → Rack → Bin** location hierarchy (§7g). `warehouse_id` is denormalized
onto balances/movements for fast warehouse-level roll-ups; the free-text `bin = "A-12"` of the
mock is gone.
```
warehouses(id, name, code, location, is_finished_goods)
storage_locations(id, warehouse_id, parent_id, kind, code, is_default)  -- §7g self-ref tree (zone/rack/bin)

-- THE LEDGER — the source of truth. Immutable, append-only.
inventory_transactions(
  id,
  type,                          -- IN | OUT | TRANSFER | ADJUSTMENT | RETURN | CONSUMPTION | PRODUCTION
  component_brand_variant_id  -> component_brand_variants(id),
  location_id                 -> storage_locations(id),  -- the bin (leaf location)
  warehouse_id                -> warehouses(id),      -- denormalized from location (roll-up + FK guard)
  qty_delta,                     -- signed: +in / −out
  transfer_group_id,             -- a TRANSFER = two rows (−source, +dest location) sharing this id
  ref_type, ref_id, grn_no,      -- source doc; goods-in = type='IN' ref_type='purchase_order_item' (+grn_no)
  reason, note, created_at, created_by
)

-- READ-MODEL (projection of the ledger + open allocations). Rebuildable; never hand-edited.
inventory_balances(
  component_brand_variant_id, location_id, warehouse_id,
  on_hand,          -- = Σ inventory_transactions.qty_delta
  reserved,         -- = Σ open production_material_moves (kind='allocation')
  available,        -- = on_hand − reserved
  damaged,          -- from ADJUSTMENT/RETURN into a damaged bucket
  last_counted_at,
  UNIQUE(component_brand_variant_id, location_id)
)
```

**Transaction types**
| type | direction | typical source |
|---|---|---|
| `IN` | + | PO goods-receipt, opening stock |
| `OUT` | − | manual issue / write-off / sale |
| `TRANSFER` | ±  | move between bins/warehouses (two rows sharing `transfer_group_id`: −source bin, +dest bin) |
| `ADJUSTMENT` | ± | cycle-count correction (physical vs system) |
| `RETURN` | ± | return to supplier (−) or return from floor (+) |
| `CONSUMPTION` | − | issued to a production order (build) |
| `PRODUCTION` | + | finished goods produced into stock |

**Derivation rules (compute, never store as the truth):**
```
variant on-hand (one bin)        = Σ inventory_transactions.qty_delta for that bin
variant on-hand (one warehouse)  = Σ across the warehouse's bins
variant on-hand (all)            = Σ across warehouses
component current stock          = Σ on-hand over the component's brand variants
reserved                        = Σ open production_material_moves (kind='allocation')  (§7b)
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

### 7f. Multi-tenancy (one installation → many companies)

**The highest-priority structural decision.** The front-end mock assumes a single company, but
the backend is multi-tenant from day one — because adding a tenant key *later* means touching
almost every table, backfilling data, and reworking every unique constraint and query. Cheap now,
very expensive to retrofit.

**Model — shared schema, row-level tenancy.** One database, one schema; rows are partitioned by a
`company_id` discriminator. (Not schema-per-tenant or db-per-tenant — those complicate migrations
and cross-tenant ops for no gain at this scale.)

```
companies(id, code, name)          -- the TENANT ROOT (global; has no company_id itself)
```

- **`company_id uuid NOT NULL REFERENCES companies(id)` on every tenant-owned table.** Set on
  insert, immutable thereafter.
- **Three global tables have no `company_id`:**
  - `users` — a shared identity pool. A user reaches companies through **`company_memberships`**
    (a user can belong to *multiple* companies; one is flagged `is_default` for login).
  - There is **no permissions catalog table** — the `resource × action` permission set is an app
    constant (§7h). The **`roles`** are **per-company** and grant `(resource, action)` pairs
    directly via `role_permissions` (both carry `company_id`); a user's role in a company lives on
    `company_memberships.role_id` (no separate `user_roles` table — one role per user per company,
    multi-role deferred). Each tenant manages its own roles and grants.

**Per-company uniqueness.** Every business-key unique index is prefixed with `company_id`, so the
same human code lives once *per tenant* — `RES-10K`, `ROIP400`, `PR-0001`, warehouse `A-12` can
each recur across companies without collision. (`uq_components_generic_pn (company_id, generic_pn)`,
`uq_products_code (company_id, code)`, `uq_pr_no (company_id, pr_no)`, …)

**No cross-tenant edges — composite foreign keys.** A FK between two tenant tables is composite:
`FOREIGN KEY (company_id, component_id) REFERENCES components (company_id, id)`. This makes it
*structurally impossible* for, say, a `pcb_line` in company A to reference a `component` in company
B. It requires a `UNIQUE (company_id, id)` on every tenant table (declared alongside the PK, as the
composite-FK target). FKs pointing at the *global* `users` table stay single-column.

**Runtime isolation — Postgres Row-Level Security.** Composite FKs prevent bad *writes*; RLS
prevents bad *reads*. Each request opens its transaction with the active context:
```sql
SET LOCAL app.current_company_id = '<uuid>';
SET LOCAL app.current_user_id    = '<uuid>';
```
Every tenant table has RLS `ENABLE`d + `FORCE`d with a `tenant_isolation` policy
(`USING company_id = current_company_id()` + matching `WITH CHECK`). A query that *forgets* its
`WHERE company_id = …` still cannot see or write another tenant's rows — the database enforces it.
The app connects as a role that is **not** the table owner and **not** `BYPASSRLS`.
- `companies` → RLS limits a user to companies they're a member of.
- `company_memberships` → a user sees **all** their own memberships (for the company switcher),
  and admins manage members of the active company.
- `users` → global, no RLS; access mediated by the service layer.

**API/session layer.** Login resolves the user's memberships → picks the active company (default
or explicit switch) → every downstream request carries it (JWT claim / session), which the DB
layer turns into the two `SET LOCAL` GUCs above. Endpoints below are **implicitly scoped to the
active company**; none of them take a `companyId` param — it comes from the session, never the URL.

### 7g. Warehouse location hierarchy (Warehouse → Zone → Rack → Bin)

The mock stores a single free-text `bin` (e.g. `"A-12"`) per component. That doesn't scale once
inventory grows: you can't slot stock, direct putaway, or run a pick path. The backend models a
proper addressable tree.

```
Company → Warehouse → Zone → Rack → Bin      (ONE self-referencing table, not one per level)
storage_locations(id, warehouse_id, parent_id, kind, code, is_default)
                                     -- kind = 'zone' | 'rack' | 'bin' (enum, extensible)
                                     -- parent_id → storage_locations(id); NULL at top level
```

- **One self-referencing table, not a table per level.** `kind` tags the node (zone/rack/bin) and
  `parent_id` links up the tree. Depth is flexible — add `'aisle'`, `'shelf'`, … to the
  `location_kind` enum without new tables. Fewer tables *and* more future-ready than a
  fixed 3-level schema.
- **Stock lives at the Bin (the leaf, `kind='bin'`).** `inventory_transactions.location_id` and the
  `inventory_balances` row are keyed by location; `warehouse_id` is denormalized alongside for fast
  warehouse-level roll-ups. A location still reads as the full path *Warehouse / Zone / Rack / Bin*.
- **The tree can't cross a warehouse (or tenant).** `warehouse_id` is carried on every node and
  threaded through the self-FK — `storage_locations(company_id, warehouse_id, parent_id) →
  storage_locations(company_id, warehouse_id, id)`, and inventory→location the same way. A node can
  never point at a parent in another warehouse. (Same composite-FK technique as tenancy, §7f.)
- **Per-warehouse codes + `is_default`.** `code` is unique per warehouse (`A12` is one address);
  one default/bulk bin per warehouse (partial-unique) so a site that doesn't slot finely still has
  a valid `location_id` for every movement — `location_id` is `NOT NULL` on all movements.
- **Movements carry the location:** `production_material_moves.location_id` (reserve/issue-from) and
  every ledger row. Goods-in is a `type='IN'` ledger row into the putaway location (no separate
  receipts table). A `TRANSFER` is two ledger rows (−source, +dest location) sharing
  `transfer_group_id` — within or across warehouses.
- **Backfill from the mock:** the flat `bin` string becomes a `storage_locations` row
  (`kind='bin'`) under a default zone/rack per warehouse; existing stock lands in that bin.

### 7h. Permissions (resource × action, not generic codes)

Users → roles → permissions is already the shape (§7f). What was missing is **scope**: a
permission isn't one opaque string, it's a **verb on a resource** — a matrix.

```
resource   ×   action  →  grant (a role_permissions row)
Product        view       product.view
Product        create     product.create
Product        edit       product.edit
Product        delete     product.delete
Product        approve    product.approve
```

- **No catalog table — grants carry the pair.** `role_permissions(role_id, resource, action)`
  stores each grant directly. `action` is a fixed enum `view | create | edit | delete | approve |
  export`; `resource` names an entity or module (`product`, `inventory`, `purchase_request`,
  `report`, `role`, …). The set of *valid* `(resource, action)` combinations is an application
  constant (the verbs are an enum, the resources are known at build time), so a DB catalog earned
  its keep — dropping it removed a table without losing any capability.
- **Not every resource has every action** — only combinations that exist are ever granted.
  `approve` is meaningful for documents with an approval step (purchase_request, purchase_order,
  production_order — ties into the §7c approval workflow); `export` is for reports; plain masters
  get the four CRUD verbs.
- **Per-company grants.** A tenant's **`roles`** grant a subset via `role_permissions`; a user's
  role per company lives on `company_memberships.role_id` (§7f). So "Procurement Lead" in company A
  and B are distinct role rows granting different slices of the same matrix.
- **Enforcement.** The API guards each route by the required `resource.action`
  (e.g. `POST /products` needs `product.create`; the PR approve endpoint needs
  `purchase_request.approve`). `GET /me` returns the caller's effective permission set so the UI
  can hide/disable actions the role can't perform — the module-licensing gate (§4) and this
  permission gate stack: a module must be *licensed* **and** the role must *permit* the action.
- **Seeded** in `schema.sql`: the bootstrap Admin role is granted the whole matrix directly on
  `role_permissions` (resource×action cross-join).

### 7i. Audit log (field-level change history)

The audit *columns* (`created_by`, `updated_by`, `created_at`, `updated_at` on every table, §7
conventions) tell you **who last touched a row**. They don't tell you **what a field was before**,
or who changed it two edits ago. `audit_logs` adds that — the answer to *"who changed the supplier
price yesterday, and from what to what?"*

```
audit_logs(id, company_id, entity, entity_id, action, field, old_value, new_value, changed_by, changed_at)
```

- **One row per changed field, per write.** On `UPDATE`, the trigger diffs old vs new and appends a
  row for each field that actually changed (`field`, `old_value`, `new_value` as `jsonb`). `INSERT`
  and `DELETE` log a single whole-row snapshot.
- **Trigger-populated, not app-populated.** A generic `log_field_changes()` trigger
  (`AFTER INSERT/UPDATE/DELETE`) is attached to the audited tables, so coverage can't be forgotten
  — no code path can change a supplier price without a trail. (Excludes machine-maintained
  ledgers/projections like `inventory_balances`/`inventory_transactions`, which *are* their own audit trail.)
- **Append-only & immutable**, like the inventory ledger — no `updated_*`/`deleted_at`. RLS gives
  the app **SELECT only** (no insert/update/delete policy), so the log can't be doctored; only the
  `SECURITY DEFINER` trigger writes it. Reads are company-scoped.
- **`changed_by`** comes from the `app.current_user_id` session GUC (§7f), falling back to the
  row's `updated_by`/`created_by`.
- **Distinct from `approvals` (§7c):** `approvals` is the *decision* trail for a workflow (who
  approved a PR); `audit_logs` is the *data* trail for every field on every table.
- Indexed for the common questions: by `(entity, entity_id)` (a record's history), by `changed_by`
  (a user's activity), and by `(entity, field)` (e.g. all supplier-price changes over time). A
  monthly partition on `changed_at` is the documented scaling step.

### Suggested REST endpoints (mirror current UI reads)
```
-- TENANCY RULE: no endpoint below takes a companyId — the active company comes
-- from the authenticated session (JWT claim → app.current_company_id GUC), never
-- from the URL, query, or body. A client CANNOT request another tenant's data by
-- changing a parameter; there is no parameter to change. All paths are implicitly
-- scoped to the active company (§7f). The ONLY company-aware endpoints are the
-- session/auth ones, which switch WHICH company is active — not filter by it:

-- Auth & tenant session
POST /auth/login                                 -- returns token + the user's companies (memberships)
GET  /me/companies                               -- companies this user can access (company_memberships)
POST /session/company        { companyId }        -- switch the ACTIVE company (re-issues token/claim)
GET  /me                                         -- current user + active company + effective permissions

-- RBAC admin (roles per-company; permission matrix is an app constant — §7h)
GET  /permissions                                -- the resource × action matrix (static app constant)
GET  /roles                /roles/{id}           -- roles in the active company
POST /roles                PATCH /roles/{id}     DELETE /roles/{id}
PUT  /roles/{id}/permissions   { grants:[{resource,action}] }   -- set the role's granted (resource,action) pairs
GET  /users                ?q                    -- members of the active company (via memberships)
PUT  /memberships/{id}/role    { roleId }            -- set a user's role in the active company

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
GET  /warehouses           /warehouses/{id}
GET  /warehouses/{id}/locations                  -- the Zone→Rack→Bin tree (storage_locations, §7g)
POST /locations            PATCH /locations/{id}  -- add/edit a zone/rack/bin node (kind + parent_id)
GET  /inventory                        ?componentId&variantId&warehouseId&locationId  -- balances (projection)
POST /inventory/transactions                     -- IN | OUT | TRANSFER | ADJUSTMENT | RETURN | CONSUMPTION | PRODUCTION (each carries location_id)
GET  /inventory/transactions           ?variantId&warehouseId&locationId&type&from&to  -- ledger / audit trail
GET  /reports/yield?range=6m
POST /production-orders    PATCH /production-orders/{id}       -- header + status transitions
GET  /production-orders/{id}/items                             -- STAGE 1 plan (BOM demand)
POST /production-orders/{id}/allocations                       -- STAGE 2 reserve (material move kind='allocation')
POST /production-orders/{id}/consumptions                      -- STAGE 3 issue   (material move kind='consumption')
POST /production-orders/{id}/complete                          -- STAGE 4 finished-goods receipt + close
POST /purchase-requests    PATCH /purchase-requests/{id}    -- header
POST /purchase-requests/{id}/items                          -- PR line items
POST /purchase-requests/{id}/submit                         -- Draft → Submitted
POST /purchase-requests/{id}/decision                       -- Manager/Procurement approve or reject (writes `approvals`)
POST /purchase-requests/{id}/approve                        -- (Procurement Approved) sources into PO(s), one per supplier

-- Audit, approvals & notifications
GET  /audit-logs           ?entity&entityId&field&changedBy&from&to   -- field-level history (§7i)
GET  /approvals            ?entityType&entityId              -- approval-decision trail for a document
GET  /notifications        ?unread=true                      -- current user's feed
POST /notifications/{id}/read      POST /notifications/read-all
POST /purchase-orders      PATCH /purchase-orders/{id}      -- header
POST /purchase-orders/{id}/items                            -- PO line items
POST /purchase-orders/{id}/receipts                         -- goods-in → appends inventory_transactions(type='IN'); no GRN table (§7c)
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
