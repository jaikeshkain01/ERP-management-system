# Remove mockdata + localStorage; Make the Frontend Fully DB-Driven

Strip the dead `isTesting` mock mode, relocate seed data for scripts, build real DB endpoints for the four derived pages, and clean up legacy localStorage usage.

## Confirmed Findings

Phase 1 (**Relocate shared domain layer**) is **already done**: `src/lib/catalog/{types,selectors,index}.ts` exists and `data-provider.tsx` already imports from `@/lib/catalog`. The `src/mockdata/` barrel still re-exports the same types/selectors and the raw seed arrays.

**`@/mockdata` still referenced in `src/` (16 files)**:
- Server data providers: `dashboard.ts`, `production.ts`, `purchases.ts` (types + `isTesting` branches)
- Frontend pages: `dashboard/page.tsx`, `readiness/page.tsx`, `planner/page.tsx`, `orders/page.tsx` (production), `requests/page.tsx`, `orders/page.tsx` (purchases), `reports/page.tsx`
- Type-only: `production/orders/page.tsx`, `purchases/orders/page.tsx`
- UI config: `launchpad.tsx`
- The `mockdata/index.ts` barrel itself

**`isTesting` referenced in `src/` (~50 hits across 16 files)**:
- `config.ts` (definition)
- `session.ts`, `mock.ts`
- All server data providers: `dashboard.ts`, `production.ts`, `purchases.ts`, `modules.ts`, `warehouses.ts`, `custom-products.ts`
- API routes: `auth/login/route.ts`, `me/route.ts`, `me/companies/route.ts`, `session/company/route.ts`
- Comments only: `components.ts`, `prisma.ts`, `data-provider.tsx`, 2 page files

**localStorage**: Only live use is theme (`theme-toggle.tsx` + `layout.tsx`). Dead legacy migration in `user-products.tsx` (lines 206-298).

---

## Phase 1 — Already Complete ✅

`src/lib/catalog/` already contains `types.ts`, `selectors.ts`, `index.ts` with all the right exports. `data-provider.tsx` already imports from `@/lib/catalog`. No action needed.

---

## Phase 2 — Strip Mock Mode (Server → DB-Only)

### 2A — Server Data Providers

For each file, remove the `isTesting` import, the mock-array/`@/mockdata` imports, and every `if (isTesting) { … }` branch. Keep only the DB branch.

#### [MODIFY] [dashboard.ts](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/src/lib/server/data/dashboard.ts)
- Remove imports: `isTesting`, `COMPONENTS` from `@/mockdata`, all imports from `@/mockdata/dashboard`
- **Move the dashboard types** (`BlockerItem`, `DashProductionOrder`, `ActivityItem`, `ProductStatusItem`, `LowStockItem`, etc.) **into this file** since they're consumed here and by the dashboard page
- Remove `mockInventoryValue()` function entirely
- Remove `if (isTesting) { … }` early return in `getDashboard()`
- **Extend** `getDashboard()` to also return the catalog-derived panels (PRODUCT_STATUS, LOW_STOCK, SINGLE_SUPPLIER, TOP_CONSUMED, USAGE_IMPACT, INVENTORY_CHART) — this replaces client-side `buildDashboardData()`. Add these as new fields on `DashboardSummary`.

#### [MODIFY] [production.ts](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/src/lib/server/data/production.ts)
- Remove imports: `isTesting`, `PRODUCTION_ORDERS` from `@/mockdata/production`, `PRODUCTION_YIELD` from `@/mockdata/reports`
- Move `MonthlyYield` type definition **into this file** (replace the import)
- Remove every `if (isTesting) return …` / `if (isTesting) throw mockReadOnly()` line (lines 97-98, 119, 143, 210, 282, 342, 372, 408)
- Remove `mockReadOnly()` helper
- Remove `MOCK_REPORTS_SUMMARY` static fallback
- **Add** `getReadiness(productSlug: string, qty: number)` — new function for production readiness endpoint

#### [MODIFY] [purchases.ts](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/src/lib/server/data/purchases.ts)
- Remove imports: `isTesting`, `formatINR` from `@/mockdata`, `PURCHASE_ORDERS`/`PURCHASE_REQUESTS` from `@/mockdata/purchases`
- Import `formatINR` from `@/lib/catalog` instead (it's re-exported there)
- Remove every `if (isTesting) return …` / `if (isTesting) throw mockReadOnly()` line (lines 82, 118, 164, 226, 288)
- Remove `mockReadOnly()` helper
- **Add** `getRecommendations(componentPN: string)` — new function for recommendations endpoint

#### [MODIFY] [modules.ts](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/src/lib/server/data/modules.ts)
- Remove `isTesting` import and both `if (isTesting)` branches (lines 27, 41)

#### [MODIFY] [warehouses.ts](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/src/lib/server/data/warehouses.ts)
- Remove `isTesting` import, `MOCK_WAREHOUSE`/`MOCK_BIN` imports from `@/lib/server/mock`
- Remove both `if (isTesting)` branches (lines 40, 50-53)

#### [MODIFY] [custom-products.ts](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/src/lib/server/data/custom-products.ts)
- Remove `isTesting` import
- Remove `mockReadOnly()` helper
- Remove every `if (isTesting) return []` / `if (isTesting) throw mockReadOnly()` line (lines 135, 154, 192, 208, 223, 252)

#### [MODIFY] [bootstrap.ts](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/src/lib/server/data/bootstrap.ts)
- Already clean — imports from `@/lib/catalog`, no `isTesting` references. No changes needed.

#### [MODIFY] [components.ts](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/src/lib/server/data/components.ts)
- Only has `isTesting` in a **comment** (line 2). Update the comment. No functional changes needed.

### 2B — Session & Auth

#### [MODIFY] [session.ts](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/src/lib/server/session.ts)
- Remove `isTesting` import and `MOCK_CONTEXT` import
- Remove `if (isTesting) return MOCK_CONTEXT;` line in `requireSession()`
- Update JSDoc to remove mock-mode mention

#### [MODIFY] [login/route.ts](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/src/app/api/auth/login/route.ts)
- Remove `isTesting` import and `MOCK_USER`/`MOCK_COMPANY` import
- Remove `if (isTesting) { return ok(…) }` block

#### [MODIFY] [me/route.ts](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/src/app/api/me/route.ts)
- Remove `isTesting` import and `MOCK_USER`/`MOCK_COMPANY` import
- Remove `if (isTesting) { return ok(…) }` block

#### [MODIFY] [me/companies/route.ts](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/src/app/api/me/companies/route.ts)
- Remove `isTesting` import and `MOCK_COMPANY` import
- Remove `if (isTesting) { … }` block

#### [MODIFY] [session/company/route.ts](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/src/app/api/session/company/route.ts)
- Remove `isTesting` import and `MOCK_COMPANY` import
- Remove `if (isTesting) { … }` block

### 2C — Config & Env

#### [MODIFY] [config.ts](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/src/lib/config.ts)
- Delete the entire file (only contained `isTesting`)

#### [MODIFY] [.env](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/.env)
- Remove the "Data source toggle" comment block (lines 28-35) and the `isTesting="false"` line (line 35)

### 2D — Delete Dead Module

#### [DELETE] [mock.ts](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/src/lib/server/mock.ts)

---

## Phase 3 — Relocate Raw Seed Arrays, Then Delete `src/mockdata/`

### 3A — Move Seed Data

#### [NEW] scripts/seed-data/products.ts
- Move `PRODUCTS` array from `src/mockdata/products.ts`, importing types from `@/lib/catalog`

#### [NEW] scripts/seed-data/pcbs.ts
- Move `PCBS` array from `src/mockdata/pcbs.ts`, importing types from `@/lib/catalog`

#### [NEW] scripts/seed-data/components.ts
- Move `COMPONENTS` array from `src/mockdata/components.ts`, importing types from `@/lib/catalog`

#### [NEW] scripts/seed-data/brands.ts
- Move `BRANDS` array from `src/mockdata/brands.ts`, importing types from `@/lib/catalog`

#### [NEW] scripts/seed-data/suppliers.ts
- Move `SUPPLIERS` array from `src/mockdata/suppliers.ts`, importing types from `@/lib/catalog`

#### [NEW] scripts/seed-data/purchases.ts
- Move `PURCHASE_ORDERS` and `PURCHASE_REQUESTS` arrays (only) from `src/mockdata/purchases.ts`

#### [NEW] scripts/seed-data/index.ts
- Re-export all seed arrays

### 3B — Repoint Seed Scripts

#### [MODIFY] [seed-sample.ts](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/scripts/seed-sample.ts)
- Change imports from `../src/mockdata/*` to `./seed-data/*`

#### [MODIFY] [seed-inventory.ts](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/scripts/seed-inventory.ts)
- Change import from `../src/mockdata/components` to `./seed-data/components`

#### [MODIFY] [seed-purchases.ts](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/scripts/seed-purchases.ts)
- Change imports from `../src/mockdata/components` and `../src/mockdata/purchases` to `./seed-data/*`

### 3C — Move Launchpad Config

#### [NEW] [launchpad-data.ts](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/src/lib/launchpad-data.ts)
- Move `buildWorkspaceStats` + `WorkspaceStat` from `src/mockdata/launchpad.ts`
- Import `Selectors` from `@/lib/catalog`, import static panels from the server dashboard type

#### [MODIFY] [launchpad.tsx](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/src/components/launchpad.tsx)
- Change import from `@/mockdata/launchpad` to `@/lib/launchpad-data`

### 3D — Delete `src/mockdata/`

#### [DELETE] src/mockdata/ (entire directory — 14 files)

---

## Phase 4 — Real DB Endpoints for the Derived Pages

### 4A — Dashboard (Catalog Panels via API)

#### [MODIFY] [dashboard.ts](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/src/lib/server/data/dashboard.ts) (continued from Phase 2)
Extend `DashboardSummary` and `getDashboard()` to compute and return:
- `PRODUCT_STATUS[]` — for each product with an Active BOM, compute `buildableQty = min(⌊available ÷ perUnitQty⌋)` across BOM components
- `LOW_STOCK[]` — components where `on_hand < min_stock` (Critical) or `on_hand < 2×min_stock` (Low)
- `SINGLE_SUPPLIER[]` — components with exactly one active supplier price row
- `TOP_CONSUMED[]` — top 3 by `annual_consumption`
- `USAGE_IMPACT[]` — top 3 by number of products using the component
- `INVENTORY_CHART[]` — entity counts `{name, value, color}`

#### [MODIFY] [dashboard/page.tsx](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/src/app/dashboard/page.tsx)
- Remove `import { buildDashboardData } from "@/mockdata/dashboard"` and the `useMemo` call
- Consume the six new fields from the `ops` (`/api/dashboard`) response instead
- All types come from `@/lib/server/data/dashboard` (already imported)

### 4B — Production Readiness

#### [MODIFY] [production.ts](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/src/lib/server/data/production.ts) (continued from Phase 2)
Add new exported function:
```ts
export interface ReadinessResult {
  items: { component: string; genericPN: string; required: number; available: number; status: boolean }[];
  shortComponent: string;
  shortPN: string;
  missingQty: number;
  sourcing: { brand: string; brandId: string; supplierId: string; supplierName: string; price: string; leadTime: string }[];
}
export async function getReadiness(productSlug: string, qty: number): Promise<ReadinessResult>
```
Implementation: 
1. Resolve product → Active BOM → explode demand per component (Σ `pcb_line.qty × product_pcbs.qty × qty`)
2. For each component, sum available from `inventory_balances`
3. Find the first short component; look up its supplier offers for sourcing options
4. Format prices with `formatINR` from `@/lib/catalog`

#### [NEW] [route.ts](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/src/app/api/production/readiness/route.ts)
- `GET /api/production/readiness?product=<slug>&qty=<n>`
- Follow existing route pattern: `handle` / `requireSession` / `withTenant` / `assertPermission` / `ok`

#### [MODIFY] [readiness/page.tsx](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/src/app/production/readiness/page.tsx)
- Remove `import { buildProductionData } from "@/mockdata/production"`
- Add a product dropdown + qty input (loaded from `useData().PRODUCTS`)
- Fetch `GET /api/production/readiness?product=<slug>&qty=<n>` on select
- Render readiness items, shortage, sourcing from the API response

### 4C — Production Planner (Shortages)

#### [MODIFY] [planner/page.tsx](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/src/app/production/planner/page.tsx)
- Remove `import { buildProductionData } from "@/mockdata/production"`
- After "Calculate" is clicked, fetch `GET /api/production/readiness?product=<slug>&qty=<n>`
- Derive `PLANNER_SHORTAGES` from the response items where `status=false`
- The rest of the wizard steps can continue using `useData()` for BOM structure display

### 4D — Purchase Recommendations

#### [MODIFY] [purchases.ts](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/src/lib/server/data/purchases.ts) (continued from Phase 2)
Add new exported function:
```ts
export interface SourcingRecommendation {
  supplierId: string; supplierName: string;
  brandId: string; brandName: string;
  price: string; leadTime: string;
}
export async function getRecommendations(componentPN: string): Promise<SourcingRecommendation[]>
```
Implementation: look up the component by `generic_pn`, then query `supplier_component_prices` + brand/supplier names.

#### [NEW] [route.ts](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/src/app/api/purchases/recommendations/route.ts)
- `GET /api/purchases/recommendations?component=<genericPN>`

#### [MODIFY] [requests/page.tsx](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/src/app/purchases/requests/page.tsx)
- Remove `import { buildRecommendations, … } from "@/mockdata/purchases"`
- Fetch `/api/purchases/recommendations?component=<pn>` to get sourcing options
- Determine the "shortage item" dynamically (top production blocker from `/api/production/readiness` or first component below min_stock) instead of hardcoded "RES-10K"/"500"
- Import `PurchaseRequest` type from server provider instead of mockdata

### 4E — Type-Only Pages

#### [MODIFY] [production/orders/page.tsx](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/src/app/production/orders/page.tsx)
- Change `import type { ProductionOrder } from "@/mockdata/production"` → `import type { ProductionOrderView } from "@/lib/server/data/production"` (and alias `ProductionOrderView` as `ProductionOrder` if needed, or adjust the interface)

#### [MODIFY] [purchases/orders/page.tsx](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/src/app/purchases/orders/page.tsx)
- Change `import type { PurchaseOrder } from "@/mockdata/purchases"` → `import type { PurchaseOrderView } from "@/lib/server/data/purchases"` (alias as `PurchaseOrder`)

#### [MODIFY] [reports/page.tsx](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/src/app/reports/page.tsx)
- Remove `import { PRODUCTION_YIELD, type MonthlyYield } from "@/mockdata/reports"`
- Import `MonthlyYield` from `@/lib/server/data/production` (where `getYieldReport` returns it)
- Remove `PRODUCTION_YIELD` as initial state — use empty array `[]` instead and let the API populate it

---

## Phase 5 — localStorage Cleanup

#### [MODIFY] [user-products.tsx](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/src/lib/user-products.tsx)
- Remove `migrateLegacyProducts` function (lines 206-288)
- Remove `LEGACY_KEYS` constant (line 207)
- Remove `LegacyVersion`/`LegacyProduct` types (lines 209-210)
- Remove `normalizeVersion` helper (line 290+)
- Remove the migration call site in the provider effect

Theme localStorage (`theme-toggle.tsx` + `layout.tsx`) **left untouched** per decision.

---

## Phase 6 — Comment/Docstring Cleanup

Update comments/docstrings in:
- [data-provider.tsx](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/src/lib/data-provider.tsx) — remove `isTesting` mentions
- [prisma.ts](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/src/lib/prisma.ts) — remove `isTesting` / FULL MOCK MODE mention
- [components.ts](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/src/lib/server/data/components.ts) — update header comment

#### [MODIFY] [docs/API.md](file:///e:/Jaikesh%20work/Antigeravity%20Project/Mockup2%20ERP/docs/API.md)
- Document new endpoints: `GET /api/production/readiness`, `GET /api/purchases/recommendations`
- Remove mock-mode mentions

---

## New Files Summary

| File | Purpose |
|------|---------|
| `scripts/seed-data/{products,pcbs,components,brands,suppliers,purchases,index}.ts` | Raw seed arrays relocated from mockdata |
| `src/lib/launchpad-data.ts` | Launchpad UI tile config (from mockdata/launchpad) |
| `src/app/api/production/readiness/route.ts` | Real readiness endpoint |
| `src/app/api/purchases/recommendations/route.ts` | Real recommendations endpoint |

## Deleted Files Summary

| File | Reason |
|------|--------|
| `src/mockdata/` (entire, 14 files) | Mock mode removed; seed arrays moved to `scripts/seed-data/`, types to `@/lib/catalog`, launchpad to `@/lib/launchpad-data` |
| `src/lib/server/mock.ts` | Mock identity stubs no longer needed |
| `src/lib/config.ts` | Only contained `isTesting` |

---

## Verification Plan

### Automated Tests
```bash
# Must pass with zero errors
npx tsc --noEmit

# Must return no matches in src/
grep -r "@/mockdata" src/
grep -r "isTesting" src/ .env
grep -r "mock.ts" src/lib/server/
```

### Manual Verification
1. Seed a clean DB (scripts still work with relocated seed-data)
2. Dev server starts; all pages load with DB data
3. Dashboard catalog panels populate from the extended `/api/dashboard` endpoint
4. Production readiness shows real required-vs-available for a selected product+qty
5. Planner shortages derived from readiness API
6. Purchase recommendations from real supplier offers
7. Theme toggle still persists via localStorage

---

> [!IMPORTANT]
> This is a **large refactor touching ~35 files** with cross-cutting concerns. I plan to execute it in the phase order above, running `tsc --noEmit` after each phase to catch regressions early. Please review and approve before I begin.

> [!WARNING]
> The DB **must be seeded** for pages to show data after this change — there is no fallback. If you haven't run the seed scripts, pages will render empty.
