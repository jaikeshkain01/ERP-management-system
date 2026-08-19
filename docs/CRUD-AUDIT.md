# CRUD Audit — missing operations to add

> Generated from the live API routes (`src/app/api/**/route.ts`) + server data layer.
> Legend: ✅ present · ➖ intentionally absent (by design) · ❌ **missing (should add)**.

## Matrix (core entities)

| Entity | Create | Read (list) | Read (one) | Update | Delete |
|---|---|---|---|---|---|
| Items (components) | ✅ | ✅ | ➖¹ | ✅ | ✅ |
| Item variants (manufacturer) | ✅ | ✅ (via item) | – | ✅ | ✅ |
| **Item categories** | ✅ | ✅ | – | ✅ | ✅ |
| **Item lots** | ➖² | ✅ | ✅ | ✅ | ✅ |
| Manufacturers (brands) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Suppliers | ✅ | ✅ | ✅ | ✅ | ✅ |
| Supplier prices | ✅ (upsert) | ✅ | – | ✅ (upsert) | ✅ |
| **Warehouses** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Storage locations (bins)** | ✅ | ✅ | – | ✅ | ✅ |
| PCBs | ✅ | ✅ | ✅ | ✅ | ✅ |
| Products | ✅ | ✅ | ✅ | ✅ | ✅ |
| Custom products | ✅ | ✅ | ➖¹ | ✅ | ✅ |
| Inventory transactions | ✅ | ✅ | – | ➖ (immutable) | ➖ (immutable) |
| Production orders | ✅ | ✅ | ➖¹ | ➖ (lifecycle) | ✅ (cancel) |
| Purchase requests | ✅ | ✅ | ✅ | ➖ (approve) | ✅ (reject/cancel) |
| Purchase orders | ➖ (from PR) | ✅ | ✅ | ➖ (receive) | ✅ (cancel) |

¹ single-read covered by the list/bootstrap + a stock sub-resource — low priority.
² lots are auto-created on receipt; they still need read/update/delete.

---

## Missing operations, by priority

### ✅ Done (2026-08-17) — 🔴 High items shipped

- **Item lots CRUD** — `GET /api/item-lots?variantId=&componentId=`, `GET/PATCH/DELETE /api/item-lots/[id]`
  (`src/lib/server/data/item-lots.ts`). Read carries derived on-hand + valuation; DELETE blocks a lot with ledger movements.
- **Item categories update/delete** — `PATCH/DELETE /api/item-categories/[id]`
  (`item-categories.ts`). PATCH renames / re-parents and re-paths the node + descendants (materialised-path prefix swap, cycle-guarded); DELETE blocks a node with live children or assigned items.
- **Item variants update/delete** — `PATCH/DELETE /api/components/[id]/variants/[variantId]`
  (`components.ts`). PATCH fixes manufacturer / MPN (keeps (component, brand) unique); DELETE blocks a variant with stock movements or a supplier price.

### 🔴 High — needed for day-to-day correctness

1. ~~**Item lots — full CRUD**~~ ✅ done (new — lots exist but can't be managed)
   - `GET  /api/item-lots?variantId=` — list lots (no, dates, cost, supplier, on-hand).
   - `GET  /api/item-lots/[id]` — one lot.
   - `PATCH /api/item-lots/[id]` — fix lot no / unit_cost / expiry / mfg / supplier / MSL / date-code.
   - `DELETE /api/item-lots/[id]` — soft-delete a lot with no movements (else block).
   - *Why:* auto-created `LOT-UNASSIGNED` / `LOT-LEGACY` rows and typos must be correctable; cost/expiry are entered after the fact.

2. ~~**Item categories — update + delete**~~ ✅ done (currently create-only)
   - `PATCH /api/item-categories/[id]` — rename / re-parent (recompute `path` for the node + descendants).
   - `DELETE /api/item-categories/[id]` — soft-delete a leaf with no items (else block / reassign).
   - *Why:* the tree can only grow right now; no way to fix a wrong name or move a branch.

3. ~~**Item variants — update + delete**~~ ✅ done (currently add-only)
   - `PATCH /api/components/[id]/variants/[variantId]` — fix manufacturer / MPN.
   - `DELETE /api/components/[id]/variants/[variantId]` — remove a variant with no stock/price (else block).
   - *Why:* a mistyped MPN or wrong manufacturer is unfixable today.

### ✅ Done (2026-08-17) — 🟠 Medium items shipped (backend **and UI**)

UI: warehouse+bin management page (`/components/inventory/warehouses`, new Inventory tab); product edit modal on `/products/list`; PR/PO cancel buttons on the purchases pages; production-order cancel on the orders kanban.


- **Warehouses CRUD** — `POST /api/warehouses`, `GET/PATCH/DELETE /api/warehouses/[id]` (uuid or code). DELETE blocks a warehouse that still holds stock and soft-deletes its empty locations alongside. `warehouse.create/edit/delete`.
- **Storage locations (bins) CRUD** — `POST /api/warehouses/[id]/locations`, `PATCH/DELETE /api/warehouses/[id]/locations/[locId]`. Code unique per warehouse; parent must be same-warehouse; one default bin per warehouse; DELETE blocks a node with children or stock. `warehouse.*`.
- **Products update** — `PATCH /api/products/[id]` (header fields: name/code/version/description/status/estimatedCost; code stays unique). `product.edit`. BOM edits remain a separate flow.
- **PR read-one + cancel** — `GET /api/purchase-requests/[id]`, `POST …/cancel` (blocked once a PO exists or terminal). `purchase_request.view` / `.delete`.
- **PO read-one + cancel** — `GET /api/purchase-orders/[id]`, `POST …/cancel` (blocked if received fully/partially or cancelled). `purchase_order.view` / `.delete`.
- **Production-order cancel** — `POST /api/production-orders/[id]/cancel` (Draft/Ready only; releases open allocations so reserved frees; In Progress/Completed blocked). `production_order.delete`.
- Verified: `tsc` clean + `prisma db execute` SQL probe (new columns / enum casts / joins valid).

### ✅ Done (2026-08-17) — 🟡 Low items shipped (backend **and UI**)

- **Supplier-price delete** — `DELETE /api/suppliers/[id]/prices/[priceId]` (`deleteSupplierPrice`, `supplier.edit`; soft-delete, verifies the row belongs to the supplier). `SupplierPriceView` gained `id` + `brandSlug` so callers can target a row. UI: Trash button per row on `/suppliers/details` (matches live price rows to the bootstrap-derived table by `${genericPN}|${brandSlug}`), confirm modal, re-derives via `d.reload()`.

### 🟡 Low — remaining (optional)

10. **Single-read endpoints** where only list exists (items, custom-products, production-orders) — mostly covered by bootstrap; add only if a page needs a fresh single fetch. **Not built** (no consumer needs it yet).

---

## Intentionally absent (do NOT add)

- **Inventory transactions** — no UPDATE/DELETE: the ledger is append-only; corrections are reversing entries.
- **Production-order status** — no generic PATCH: state changes only via the lifecycle endpoints (allocate / consume / complete).
- **Purchase-request approval** — no PATCH: only the `/approve` action.

---

## Suggested build order
1. Item lots CRUD (#1) → 2. Category update/delete (#2) → 3. Variant update/delete (#3) → 4. Warehouse/bin CRUD (#4,5) → the rest as needed.

Each is a thin route + a guarded server function following the existing `components.ts` pattern (session → RLS → `assertPermission` → soft-delete with in-use guards).
