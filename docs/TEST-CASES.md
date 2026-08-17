# StackIOT ERP — Test Cases

> End-to-end and unit-level test cases derived from the real application flows documented in
> [`ARCHITECTURE.md`](ARCHITECTURE.md) and [`API.md`](API.md). Organized by module. Each case has a
> stable ID (`TC-<AREA>-<n>`), preconditions, steps, and the expected result. Priority: **P1** =
> critical/happy-path + security, **P2** = important edge cases, **P3** = minor/cosmetic.
>
> **Cross-cutting invariants under test everywhere:**
> - **Tenancy** — no endpoint accepts a `companyId`; the active company always comes from the session
>   (JWT → `app.current_company_id`). A caller can never read/write another tenant's rows (RLS).
> - **RBAC** — every data route is gated by a `resource.action` permission; module licensing stacks on top.
> - **Inventory golden rule** — stock is never written directly; every change is an appended
>   `inventory_transactions` row, and balances are a projection.
> - **Response shape** — success `{ data: … }`; error `{ error: { code, message, details? } }` with the
>   documented status map (400/401/403/404/409/422/500).

---

## Legend

| Field | Meaning |
|---|---|
| **ID** | `TC-<AREA>-<n>` stable identifier |
| **Pri** | P1 / P2 / P3 |
| **Pre** | Preconditions / fixtures |
| **Steps** | Action(s) performed |
| **Expected** | Pass criteria |

Test users referenced below (create via seed / superadmin):
- **admin** — full permission matrix, module: all enabled (`admin@stackiot.local`).
- **viewer** — only `*.view` grants.
- **procurement** — `purchase_request.*`, `purchase_order.*`, `inventory.create`.
- **superadmin** — `users.is_superadmin = true`.
- **tenantB-user** — member of a *different* company (Company B), used for isolation tests.

---

## 1. Authentication & Session

| ID | Pri | Pre | Steps | Expected |
|---|---|---|---|---|
| TC-AUTH-01 | P1 | Seeded admin | `POST /api/auth/login` with valid email + password | 200; `{ user, company }` returned; `erp_session` httpOnly cookie set (SameSite=Lax, 7d) |
| TC-AUTH-02 | P1 | — | Login with wrong password | 401, single generic message; **no** account-enumeration hint; no cookie set |
| TC-AUTH-03 | P1 | — | Login with unknown email | 401, same generic message as TC-AUTH-02 (indistinguishable) |
| TC-AUTH-04 | P2 | User with no active membership | Valid credentials | 403 "No active company membership" |
| TC-AUTH-05 | P2 | Inactive user | Valid credentials | 401 (treated as invalid) |
| TC-AUTH-06 | P2 | — | Login body missing `password` / malformed email | 422 `validation_error` |
| TC-AUTH-07 | P1 | Logged in | `POST /api/auth/logout` | 200 `{ ok: true }`; cookie cleared; subsequent protected call → 401 |
| TC-AUTH-08 | P2 | No session | `POST /api/auth/logout` | 200 (idempotent, no error) |
| TC-AUTH-09 | P1 | — | Call any `/api/*` (except login/logout) with no cookie | 401 in standard error envelope (edge gate `src/proxy.ts`) |
| TC-AUTH-10 | P1 | — | Visit a protected **page** (e.g. `/dashboard`) signed out | 307 redirect to `/login` (no protected-shell flash) |
| TC-AUTH-11 | P1 | — | Visit `/login` signed out | Renders login page (not redirected) |
| TC-AUTH-12 | P2 | Tampered/expired JWT in cookie | Any protected call | 401 (signature/expiry verified at edge, no DB) |
| TC-AUTH-13 | P1 | Logged in | `GET /api/me` | 200 `{ user (incl. is_superadmin), company, permissions: string[] }` sorted `resource.action` |
| TC-AUTH-14 | P2 | User is member of ≥2 companies | `GET /api/me/companies` | 200 lists all memberships; correct `isDefault`, `status`, `isActive` (== session company) flags |
| TC-AUTH-15 | P1 | Member of Company A & B, active = A | `POST /api/session/company { companyId: B }` | 200; cookie re-issued; `GET /me` now shows Company B + B's permissions |
| TC-AUTH-16 | P1 | Member of A only | `POST /api/session/company { companyId: B }` | 403 (no active membership in B) |
| TC-AUTH-17 | P2 | Logged in | `POST /api/session/company` with non-uuid `companyId` | 422 |
| TC-AUTH-18 | P1 | Logged in | `POST /api/me/password` with correct current + new password | 200; old password now rejected, new password accepted at login |
| TC-AUTH-19 | P2 | Logged in | `POST /api/me/password` with wrong current password | 401/403; password unchanged |

---

## 2. Multi-Tenancy & RLS Isolation (security-critical)

| ID | Pri | Pre | Steps | Expected |
|---|---|---|---|---|
| TC-TEN-01 | P1 | Component `X` exists in Company A only; logged in as tenantB-user | `GET /api/components/{X}` | 404 (RLS hides it — not 403, the row is invisible) |
| TC-TEN-02 | P1 | Same as above | `PATCH /api/components/{X}` | 404 / no rows affected; A's row unchanged |
| TC-TEN-03 | P1 | Both companies have a component with generic PN `RES-10K` | List components as A, then as B | Each sees only its own `RES-10K`; no cross-leak; both allowed to exist (per-company uniqueness) |
| TC-TEN-04 | P1 | — | Attempt to pass `?companyId=` / body `companyId` to any data route | Ignored; scope still from session (parameter has no effect) |
| TC-TEN-05 | P1 | — | Simulate a query path that "forgets" `WHERE company_id` | DB RLS still returns 0 foreign rows (defense in depth) |
| TC-TEN-06 | P2 | — | Create PCB line in A referencing a component id that belongs to B | Rejected (composite FK makes cross-tenant reference structurally impossible) |
| TC-TEN-07 | P2 | Bare `prisma.*` call outside `withTenant` | Any read | Returns 0 rows (safe failure mode, not an error) |
| TC-TEN-08 | P1 | Doc numbers PR-0001 exist in A & B | Create PRs in both | No collision; each tenant numbers independently |

---

## 3. RBAC / Permissions

| ID | Pri | Pre | Steps | Expected |
|---|---|---|---|---|
| TC-RBAC-01 | P1 | viewer (only `*.view`) | `POST /api/components` (create) | 403 `forbidden` |
| TC-RBAC-02 | P1 | viewer | `GET /api/components` | 200 (view granted) |
| TC-RBAC-03 | P1 | procurement (no `component.delete`) | `DELETE /api/components/{id}` | 403 |
| TC-RBAC-04 | P1 | admin | Any documented action | Allowed (full matrix) |
| TC-RBAC-05 | P1 | — | `GET /api/permissions` | 200 `{ matrix, all }` — the static `resource × action` catalog (what CAN be granted, not what caller has) |
| TC-RBAC-06 | P2 | Role granted only `product.view`; `bom` module OFF | Access Product Structure tab | Blocked — **both** license AND permission required (gates stack) |
| TC-RBAC-07 | P2 | User whose role lacks `report.view` | `GET /api/reports/yield` | 403 |
| TC-RBAC-08 | P1 | procurement | `POST /api/purchase-requests/{id}/approve` (`purchase_request.approve` granted) | Allowed |
| TC-RBAC-09 | P1 | `GET /me` for viewer | Inspect `permissions` | UI hides/disables create/edit/delete actions the role can't perform |
| TC-RBAC-10 | P2 | Consume production (needs `production_order.edit` + `inventory.create`); role has only the first | `POST .../consumptions` | 403 (both required) |

---

## 4. Superadmin Console (cross-tenant)

| ID | Pri | Pre | Steps | Expected |
|---|---|---|---|---|
| TC-SA-01 | P1 | Non-superadmin | Any `/api/superadmin/*` | 403 |
| TC-SA-02 | P1 | superadmin | `GET /api/superadmin/overview` | 200; users(+memberships), companies(+counts+module maps), roles(+grants+member counts), permission matrix, module ids |
| TC-SA-03 | P1 | superadmin | `POST /api/superadmin/companies` | Company created **and** an Admin role seeded granting full matrix |
| TC-SA-04 | P2 | superadmin; existing company code | Create company with duplicate `code` | 409 |
| TC-SA-05 | P1 | superadmin | `POST /api/superadmin/users` then `POST /superadmin/users/{id}/memberships` | User created; added to company with optional role |
| TC-SA-06 | P2 | superadmin; existing email | Create user with duplicate email | 409 |
| TC-SA-07 | P1 | superadmin (self) | Try to deactivate self / remove own superadmin flag | Rejected (self-lockout guard) |
| TC-SA-08 | P1 | superadmin; role has members | `DELETE /superadmin/roles/{id}` | Rejected (role with members can't be deleted) |
| TC-SA-09 | P2 | superadmin | `PUT /superadmin/roles/{id}/permissions` with a grant NOT in the matrix | Rejected (grants validated against matrix) |
| TC-SA-10 | P2 | superadmin | Set a membership `is_default = true` | Prior default for that user is cleared (only one default) |
| TC-SA-11 | P1 | superadmin | `PUT /superadmin/companies/{id}/modules` toggle a module | That company's module license flips; gating reflects it |
| TC-SA-12 | P1 | superadmin | `DELETE /superadmin/users/{id}` (per recent self-lockout work) | Deletes user; **cannot** delete self (guard) |
| TC-SA-13 | P2 | superadmin | `PATCH /superadmin/users/{id} { password }` | Password reset without current-password check |

---

## 5. Components (master)

| ID | Pri | Pre | Steps | Expected |
|---|---|---|---|---|
| TC-CMP-01 | P1 | admin | `GET /api/components` | 200; camelCase view incl. derived `stock`/`available`/`reserved`/`stockStatus` |
| TC-CMP-02 | P2 | admin | `GET /components?q=res&category=Passive&solderType=SMD&footprint=R0603` | Filtered results; case-insensitive `q` across generic_pn/name/description |
| TC-CMP-03 | P2 | admin | `GET /components?solderType=INVALID` | 422 (enum SMD|DIP) |
| TC-CMP-04 | P1 | admin | `POST /api/components` valid body (+ variants + opening stock) | 201 `ComponentView`; opening stock seeded via `IN` ledger; `stock` reflects it |
| TC-CMP-05 | P1 | admin; PN already exists | `POST /components` duplicate `genericPN` | 409 `conflict`; surfaced as toast on `/components/add` |
| TC-CMP-06 | P2 | admin | Create component with an empty-key spec row | Empty-key specs dropped; other specs kept in order |
| TC-CMP-07 | P2 | admin; variant with new brand name | Create component; brand doesn't exist | Brand auto-created (slug from name); variant linked |
| TC-CMP-08 | P2 | admin; opening stock but no default bin | Create component with `stock>0` | 409 (needs a default bin for the IN row) |
| TC-CMP-09 | P1 | admin | `PATCH /components/{id}` edit name/category/minStock/specs | 200; fields updated; audit_logs row(s) written by trigger |
| TC-CMP-10 | P1 | Component referenced by an active PCB BOM line | `DELETE /components/{id}` | 409 `conflict` (in use) |
| TC-CMP-11 | P1 | Component not referenced anywhere | `DELETE /components/{id}` | 200; soft-deleted (`deleted_at` set); disappears from lists but re-create of same PN allowed |
| TC-CMP-12 | P1 | admin | `POST /components/{id}/variants` new brand variant (+ opening stock) | 201; variant added; opening stock via IN ledger |
| TC-CMP-13 | P1 | admin | `GET /components/{id}/stock` | 200 rolled-up `{ onHand, reserved, available, damaged, byWarehouse[], byVariant[] }` |
| TC-CMP-14 | P2 | admin | `GET /components/{id}/usage` (where-used) | Lists every product/PCB consuming the component with qty |
| TC-CMP-15 | P2 | Component details page | Edit price / add supplier / add variant | Persists via API (localStorage removed); reload reflects it |
| TC-CMP-16 | P3 | — | `GET /components/{nonexistent}` | 404 |

---

## 6. Brands & Suppliers (master)

| ID | Pri | Pre | Steps | Expected |
|---|---|---|---|---|
| TC-BRD-01 | P1 | admin | `GET /api/brands`, `/brands/{id}` (uuid **or** slug), `/brands/{id}/components` | 200; correct `BrandView`; `{id}` resolves by uuid or slug |
| TC-BRD-02 | P1 | admin | `POST /api/brands` | 201; slug derived from name; `brand.create` enforced |
| TC-BRD-03 | P2 | admin | `PATCH /brands/{id}` edit fields | 200; slug immutable (cannot be changed) |
| TC-BRD-04 | P2 | viewer | `POST /brands` | 403 |
| TC-SUP-01 | P1 | admin | `GET /suppliers`, `/suppliers/{id}`, `/suppliers/{id}/prices` | 200; prices = current price book (`valid_to IS NULL`) joined to component + brand |
| TC-SUP-02 | P1 | admin | `POST /suppliers` | 201; slug from name; `supplier.create` |
| TC-SUP-03 | P1 | admin | `POST /suppliers/{id}/prices` upsert current price for (component, brand) | 200/201; prior open row closed / new current row set; `supplier.edit` enforced |
| TC-SUP-04 | P2 | admin | Add price then update it | Temporal price book keeps history; only one `valid_to IS NULL` current row per (component, supplier, brand) |
| TC-SUP-05 | P2 | Supplier Details page | Map a component to supplier | Persists via API; parts catalog updates |

---

## 7. PCBs (BOM)

| ID | Pri | Pre | Steps | Expected |
|---|---|---|---|---|
| TC-PCB-01 | P1 | admin | `GET /api/pcbs`, `/pcbs/{id}`, `/pcbs/{id}/bom` | 200; resolves through **Active `pcb_revision`**; `lineCount`, `totalParts` (Σ qty), `usedInProducts[]` correct |
| TC-PCB-02 | P1 | admin | `POST /api/pcbs` with a BOM (`lines[]`) | 201; creates `pcbs` + Active `pcb_revision (Rev A)` + one `pcb_line` per component (qty aggregated per component) |
| TC-PCB-03 | P2 | admin; line with unknown component | `POST /pcbs` line has `partNumber`/`name` not in catalog | Component created on the fly (by generic_pn) and linked |
| TC-PCB-04 | P2 | PCB used by ≥1 product | `GET /pcbs/{id}` | `usedInProducts` lists the product codes via `product_pcbs` |
| TC-PCB-05 | P2 | admin | `GET /pcbs/{id}/bom` | Lines include `component{…}`, `qty`, `refDes`, `preferredBrand{id,name}|null`, `remarks` |
| TC-PCB-06 | P3 | PCB Structure page | Build-qty calculator scales | BOM quantities scale by build qty; Excel export produces `.xls` |
| TC-PCB-07 | P3 | — | `GET /pcbs/{unknown}` | 404 |

---

## 8. Products (BOM)

| ID | Pri | Pre | Steps | Expected |
|---|---|---|---|---|
| TC-PRD-01 | P1 | admin | `GET /api/products`, `/products/{id}` (uuid/slug/code) | 200; list has `pcbCount`, `uniqueComponentsCount`; detail adds `totalParts`, `brandCount`, `pcbs[]` board list |
| TC-PRD-02 | P1 | admin | `GET /products/{id}/bom` | Flattened BOM; component **qty = pcb_line.qty × product_pcbs.qty**; resolves via Active `bom_version` → pinned `pcb_revision` |
| TC-PRD-03 | P1 | admin | `POST /api/products` (PCBs + lines) | 201; creates PCBs + Active `pcb_revision` + `pcb_lines` linked via Active `bom_version` → `product_pcbs` (qty/sequence) |
| TC-PRD-04 | P2 | admin; flat `lines[]` body | `POST /products` with no `pcbs[]` | Wrapped into a single auto "<name> Main Board" |
| TC-PRD-05 | P2 | admin; same component twice | Create product where a component recurs | Deduped by generic_pn |
| TC-PRD-06 | P1 | Product with live production orders | `DELETE /products/{id}` | 409 (has live production orders) |
| TC-PRD-07 | P1 | Product with no live orders | `DELETE /products/{id}` | 200; product + BOM graph (`product_pcbs`, `bom_versions`) soft-deleted; shared PCBs/components left intact |
| TC-PRD-08 | P2 | Product Structure page | Build-qty calculator + Excel/BOM view | Quantities scale; tree view + flattened Excel view consistent; `.xls` export works |
| TC-PRD-09 | P3 | Products list | Search + status filter (Ready/Blocked/Limited) | Client filter narrows cards correctly |

---

## 9. Custom (user-added) Products

| ID | Pri | Pre | Steps | Expected |
|---|---|---|---|---|
| TC-CPR-01 | P1 | admin | `POST /api/custom-products` via Import BOM / Add Manually (raw MPN/mfr/qty lines) | 201; `CustomProductView` with `versions[]`, `activeVersionId`; id = `cp-<slug>` |
| TC-CPR-02 | P1 | admin | `GET /custom-products` and `/{id}` (accepts `cp-<slug>`, bare slug, or uuid) | 200; correct resolution |
| TC-CPR-03 | P2 | admin | `POST /custom-products/{id}/versions` | New version added **and** activated |
| TC-CPR-04 | P2 | admin | `PATCH /custom-products/{id}` set active version | 200; `activeVersionId` updated |
| TC-CPR-05 | P1 | Custom product with one version | `DELETE /custom-products/{id}/versions/{versionId}` (the last one) | Refused (can't delete the last version) |
| TC-CPR-06 | P1 | admin | `DELETE /custom-products/{id}` | Soft-deletes product + all versions |
| TC-CPR-07 | P2 | BOM Import modal | Import the `BOM PCB SSCE.xlsx` file | Rows parsed into raw lines; preview shown before persist |

---

## 10. Inventory Ledger (append-only — golden rule)

| ID | Pri | Pre | Steps | Expected |
|---|---|---|---|---|
| TC-INV-01 | P1 | admin; MAIN warehouse + default bin seeded | `GET /api/warehouses`, `/warehouses/{id}/locations` | 200; Zone→Rack→Bin tree; resolves by uuid or code |
| TC-INV-02 | P1 | admin | `GET /api/inventory?componentId&variantId&warehouseId&locationId` | 200; balances projection filtered as requested |
| TC-INV-03 | P1 | admin (`inventory.create`) | `POST /inventory/transactions` type `IN` `{ variantId, locationId, qty>0 }` | 201; `inventory_transactions` row appended; trigger projects `+qty` onto `inventory_balances`; response returns updated balances |
| TC-INV-04 | P1 | admin | `POST` type `OUT`/`CONSUMPTION` (qty_delta = −qty) | 201; on_hand decremented |
| TC-INV-05 | P1 | On-hand < requested out qty | `POST` `OUT` exceeding available | 409 `conflict` (insufficient stock); no row written |
| TC-INV-06 | P1 | admin | `POST` type `TRANSFER` `{ variantId, fromLocationId, toLocationId, qty }` | Two legs sharing a `transfer_group_id` (−source, +dest); warehouse_id derived from location |
| TC-INV-07 | P2 | admin | `POST` type `ADJUSTMENT` `{ qtyDelta≠0 }` (signed) | 201; signed delta applied |
| TC-INV-08 | P2 | admin | `POST` `ADJUSTMENT` with `qtyDelta = 0` | 422 (must be non-zero) |
| TC-INV-09 | P2 | admin | `POST` `IN` with `qty = 0` or negative | 422 (qty>0 for IN/RETURN/PRODUCTION) |
| TC-INV-10 | P1 | Any user without `inventory.create` | `POST /inventory/transactions` | 403 |
| TC-INV-11 | P1 | — | Attempt to directly UPDATE/DELETE an `inventory_transactions` row (SQL) | Blocked — ledger is immutable/append-only; runtime role can't mutate it |
| TC-INV-12 | P1 | admin | `GET /inventory/transactions?variantId&type&from&to&limit` | 200; ledger newest-first; filters + limit honored |
| TC-INV-13 | P1 | Reversing a bad entry | Post an opposite `ADJUSTMENT` | Balance corrects; original row remains (correction = reversing entry, never edit/delete) |
| TC-INV-14 | P1 | Multiple bins for a variant | Sum on-hand | Component current stock = Σ on_hand over its brand variants over bins (derivation matches UI) |
| TC-INV-15 | P1 | **(from memory: stock-from-balances)** | Inventory page on-hand display | On-hand comes from `inventory_balances` projection, never a capped client-side ledger replay |
| TC-INV-16 | P2 | Inventory page (`/components/inventory`) | Record an IN then an OUT movement | Running-balance history + status (Healthy/Low/Critical) + value (stock × unitCost) update live |

---

## 11. Production Order Lifecycle (§7b)

> Lifecycle: **Draft → Ready (allocate) → In Progress (consume) → Completed (finish)**.

| ID | Pri | Pre | Steps | Expected |
|---|---|---|---|---|
| TC-PROD-01 | P1 | admin; product with Active BOM | `POST /api/production-orders { product, qty>0 }` | 201; MO-###### number; Active `bom_version` snapshotted; demand exploded into `production_order_items` (Σ pcb_line.qty × product_pcbs.qty × qty), status **Draft** |
| TC-PROD-02 | P2 | admin | `POST /production-orders` with `qty ≤ 0` | 422 |
| TC-PROD-03 | P1 | Draft order; all items in stock | `POST /production-orders/{id}/allocations` | Reserves per item across bins; `inventory_balances.reserved` bumped; items→allocated; order→**Ready** |
| TC-PROD-04 | P1 | Draft order; ≥1 item short | `POST .../allocations` | 409 `conflict` `{ shorts:[{componentId,required,available}] }`; **nothing** reserved (atomic pre-check) |
| TC-PROD-05 | P1 | Ready order | `POST /production-orders/{id}/consumptions` | Appends `CONSUMPTION` ledger rows (on_hand −qty), records `kind='consumption'` moves, releases reservation (reserved −qty); items→consumed; order→**In Progress** |
| TC-PROD-06 | P1 | In Progress order | `POST /production-orders/{id}/complete` | Order→**Completed** (finished-goods for the product not modelled; consumed parts already off ledger) |
| TC-PROD-07 | P1 | Completed order | `POST .../complete` again | 409 (re-complete guarded) |
| TC-PROD-08 | P1 | Draft order | Try to consume before allocate | Rejected (status guard: consume requires Ready) |
| TC-PROD-09 | P1 | Ready order | Try to complete before consume | Rejected (complete requires In Progress) |
| TC-PROD-10 | P1 | admin | `GET /production-orders/{id}/items` | STAGE-1 plan per component with derived `allocated`, `consumed`, `available`, `status` |
| TC-PROD-11 | P2 | Kanban `/production/orders` | Drag card Draft→Ready→In Progress→Complete | Each drag calls the matching lifecycle endpoint; board reflects new status |
| TC-PROD-12 | P2 | Kanban | Drag card across a non-adjacent lane | Rejected with a toast (only adjacent transitions) |
| TC-PROD-13 | P1 | After allocate, before consume | Inspect balances | `available` dropped by reserved amount; `on_hand` unchanged (allocation is not a physical txn) |
| TC-PROD-14 | P2 | Consume with actual ≠ planned | Consume differing qty | Variance (consumed vs required) recorded and reportable |

---

## 12. Production Readiness & Planner

| ID | Pri | Pre | Steps | Expected |
|---|---|---|---|---|
| TC-RDY-01 | P1 | admin | `GET /api/production/readiness?product=&qty=100` | 200; per-component `required` vs `available`; biggest shortage → `shortComponent`/`shortPN`/`missingQty` + `sourcing[]` from price book |
| TC-RDY-02 | P2 | No `product` param | `GET /production/readiness` | Defaults to first product with an Active BOM; `qty` defaults to 100 |
| TC-RDY-03 | P1 | Readiness page | Create PR from a shortage | `POST /api/purchase-requests`; PR appears in Purchasing |
| TC-RDY-04 | P2 | Planner `/production/planner` | Run MRP wizard → generate PRs | PRs created via API (localStorage removed) |
| TC-RDY-05 | P2 | Product fully in stock | Readiness for buildable qty | No shortage; all items status = OK |

---

## 13. Purchasing — PR → PO → Receive (§7c)

| ID | Pri | Pre | Steps | Expected |
|---|---|---|---|---|
| TC-PUR-01 | P1 | procurement | `POST /api/purchase-requests { component, brand?, supplier?, qty }` | 201; PR (**Submitted**) + one item priced from current price book; `PR-######` number |
| TC-PUR-02 | P1 | admin | `GET /api/purchase-requests` | Flattened rows (one per item); UI status mapping (Submitted/Manager Approved → "Pending Approval", Procurement Approved/PO Created → "Approved") |
| TC-PUR-03 | P1 | PR in Submitted/Manager Approved | `POST /purchase-requests/{id}/approve` | Writes both `approvals` (manager seq1, procurement seq2); PR→**PO Created**; creates PO (**Sent**) + `purchase_order_items` with `pr_item_id` traceability; returns `{ pr, po }` |
| TC-PUR-04 | P1 | PR already PO Created | `POST .../approve` again | 409 (status guard) |
| TC-PUR-05 | P1 | admin | `GET /api/purchase-orders` | Flattened rows with PR traceability (`prId` link) |
| TC-PUR-06 | P1 | PO in Sent; procurement (`purchase_order.edit` + `inventory.create`) | `POST /purchase-orders/{id}/receive` | Appends `IN` ledger rows (ref_type=`purchase_order_item`, grn note) into default bin; sets `received_qty`; PO→**Completed**; balance rises by received qty |
| TC-PUR-07 | P1 | PO already Completed | `POST .../receive` again | 409 (re-receive guarded) |
| TC-PUR-08 | P1 | Receiving user lacks `inventory.create` | `POST .../receive` | 403 (both perms required) |
| TC-PUR-09 | P2 | procurement | `GET /api/purchases/recommendations?component=` | Sourcing options for the component (supplier price book) |
| TC-PUR-10 | P2 | procurement | `GET /purchases/recommendations` with no `component` | Auto-picks biggest current BOM shortage with a `suggestedQty` |
| TC-PUR-11 | P1 | — | End-to-end: create PR → approve → PO → receive | Component variant balance += received qty; IN ledger row present; double-receive → 409 |
| TC-PUR-12 | P2 | PR create with unknown supplier/brand names | Component Details "Add Supplier" path | Unknown supplier/brand auto-created then priced |
| TC-PUR-13 | P3 | Missing required PR field | `POST /purchase-requests` bad body | 422 |

---

## 14. Dashboard & Reports

| ID | Pri | Pre | Steps | Expected |
|---|---|---|---|---|
| TC-DSH-01 | P1 | admin | Load `/dashboard` (via `GET /api/dashboard`) | All panels render (Overview/Manufacturing/Inventory/Procurement); KPIs (low-stock, single-supplier, top-consumed, product status) match derived data |
| TC-DSH-02 | P2 | Dashboard | Click low-stock / risk quick-links | Navigate to components/list, purchases/requests, etc. correctly |
| TC-RPT-01 | P1 | admin (`report.view`) | `GET /api/reports/yield?range=6m` | 200; Σ Completed-order qty bucketed by month, zero-filled onto last N months (labelled Jan…Dec) |
| TC-RPT-02 | P2 | admin | `?range=` out of bounds (e.g. `99m`, `0m`) | Clamped to 1–24 |
| TC-RPT-03 | P2 | Reports page; fetch fails | Load `/reports` | Chart falls back to static series (no crash) |
| TC-RPT-04 | P2 | No completed orders in range | Yield report | All months zero-filled; chart still renders |

---

## 15. Module Licensing & Navigation

| ID | Pri | Pre | Steps | Expected |
|---|---|---|---|---|
| TC-MOD-01 | P1 | `inventory` module OFF | Navigate to `/components/inventory` | `module-gate` blocks the route; Launchpad tile shows as unavailable |
| TC-MOD-02 | P1 | `bom` module OFF | Product/PCB pages | List pages (free base areas) stay visible; **Structure** tabs disappear |
| TC-MOD-03 | P2 | Settings | Toggle a module via `ModulesSettingsCard` | Enable state persists (`localStorage[mockup2_erp_enabled_modules]`); gating updates immediately |
| TC-MOD-04 | P2 | — | `workspaceForPath` / `activeTabHref` resolution | Most-specific href wins (`/components/inventory`→Inventory, `/components/list`→Components) |
| TC-MOD-05 | P3 | — | Visit `/brands`, `/purchases` (group parents) | Redirect to `/brands/list`, `/purchases/requests` |
| TC-MOD-06 | P3 | — | Visit `/products`, `/pcb-management`, `/components`, `/production`, `/suppliers` (no standalone page) | No standalone render (group parents) |
| TC-MOD-07 | P2 | Free base tier only | Access Components/Products/PCB/Suppliers | Always available (base areas, no lock) |

---

## 16. Universal Search & Launchpad

| ID | Pri | Pre | Steps | Expected |
|---|---|---|---|---|
| TC-SRCH-01 | P1 | Logged in | Open universal search, query a component/PCB/product/brand/supplier | Results across all entities (derived from live `/api/bootstrap` data) |
| TC-SRCH-02 | P2 | Search result clicked | Select an entity | Navigates to its detail page with the right query param |
| TC-LP-01 | P1 | Logged in | Load `/` (Launchpad) | Tile grid renders; locked (unlicensed) modules shown as unavailable; each tile links to workspace entry href |
| TC-LP-02 | P2 | Launchpad | `buildWorkspaceStats` over live selectors | Tile stats reflect real counts |

---

## 17. Data Provider / Bootstrap (frontend integration)

| ID | Pri | Pre | Steps | Expected |
|---|---|---|---|---|
| TC-BOOT-01 | P1 | Logged in | App mount calls `/api/me` then `/api/bootstrap` | Authenticated: bootstrap loads whole catalog in `DataSet` shape; selectors bound; gate renders after load |
| TC-BOOT-02 | P1 | Session expired/absent | App mount | `/api/me` 401 → `authState = unauthenticated` → AppShell redirects to `/login` (no auto dev-login) |
| TC-BOOT-03 | P2 | Logged in | Inspect `useData()` | Exposes selectors + `me` (incl. `is_superadmin`) + `can(permission)` + `authState` + `logout()` |
| TC-BOOT-04 | P2 | Account menu | Click Logout | `logout()` → `/api/auth/logout`; redirected to `/login` |
| TC-BOOT-05 | P1 | — | Confirm no `dev-login` / demo bypass exists | Only `POST /api/auth/login` with valid credentials establishes a session |

---

## 18. Validation, Errors & Response Shape (cross-cutting)

| ID | Pri | Pre | Steps | Expected |
|---|---|---|---|---|
| TC-ERR-01 | P1 | — | Any endpoint, malformed JSON body | 422 `validation_error` (zod) |
| TC-ERR-02 | P1 | — | Successful GET/POST | Body wrapped `{ data: … }` (or `{ data }`/201 for create) |
| TC-ERR-03 | P1 | — | Any thrown `ApiError` | `{ error: { code, message, details? } }` with correct status per map (400/401/403/404/409/422) |
| TC-ERR-04 | P2 | — | Unexpected server error | 500 `internal_error`; message not leaked; logged server-side |
| TC-ERR-05 | P2 | — | Every DB route | Runs `nodejs` runtime, `force-dynamic` (request-time) |
| TC-ERR-06 | P3 | — | Unknown `/api/*` path (signed out) | 401 at edge (gate covers non-existent routes too) |

---

## 19. Audit & Soft-Delete (data integrity)

| ID | Pri | Pre | Steps | Expected |
|---|---|---|---|---|
| TC-AUD-01 | P1 | Edit a supplier price | `POST /suppliers/{id}/prices` change | `audit_logs` row(s) written by trigger — one per changed field (old→new), `changed_by` from session GUC |
| TC-AUD-02 | P1 | — | Attempt to insert/update/delete `audit_logs` from the app role | Blocked (SELECT-only; trigger-written, immutable) |
| TC-AUD-03 | P1 | Soft-delete any master (component/product/brand) | Delete then list | Row hidden (`deleted_at` set); reads filter `deleted_at IS NULL` |
| TC-AUD-04 | P2 | Soft-deleted component with unique PN | Re-create same PN | Allowed (partial unique index is soft-delete-aware) |
| TC-AUD-05 | P2 | — | Confirm ledgers excluded from audit_logs | `inventory_transactions`/`inventory_balances` not double-audited (they are their own trail) |

---

## 20. Regression / Recently-changed Areas

> Derived from recent commits — verify these did not break.

| ID | Pri | Pre | Steps | Expected |
|---|---|---|---|---|
| TC-REG-01 | P1 | Profile/Settings tab | Load settings after "remove access permissions section" change | Profile tab renders without the removed access-permissions section; no console errors |
| TC-REG-02 | P1 | Brands | Set a brand to **Inactive** (new lifecycle state) | Status persists; Inactive brands handled correctly in lists/filters |
| TC-REG-03 | P1 | BOM Import modal | Open and import a BOM | Modal opens; rows imported; preview + persist path works |
| TC-REG-04 | P2 | Horizontal-scroll areas (DragScrollArea) | Tables/lists with wide content | Drag-to-scroll works; no layout regression vs prior `div` |
| TC-REG-05 | P1 | Superadmin | Delete a user (self-lockout guard) | Other users deletable; deleting self blocked |
| TC-REG-06 | P1 | PCB Management module | CRUD PCBs + dashboard integration | Create/read/update/delete PCBs; dashboard reflects PCB counts |

---

## 21. Non-Functional (smoke)

| ID | Pri | Pre | Steps | Expected |
|---|---|---|---|---|
| TC-NFR-01 | P2 | — | `npm run build` | Builds with no type/lint errors |
| TC-NFR-02 | P2 | — | Concurrent allocate on the same low-stock component from two orders | Atomic pre-check prevents double-reservation; one succeeds, other 409 |
| TC-NFR-03 | P3 | — | Large BOM product readiness (many components) | Response within acceptable time; no N+1 blowup |
| TC-NFR-04 | P3 | — | Currency/date formatting | `₹` and "N Days" formatted at UI render; API returns raw numbers/ISO |
| TC-NFR-05 | P2 | — | Session cookie flags in production | `secure` + httpOnly + SameSite=Lax set |

---

### Coverage summary

| Area | Cases |
|---|---|
| Auth & Session | TC-AUTH-01…19 |
| Tenancy / RLS | TC-TEN-01…08 |
| RBAC | TC-RBAC-01…10 |
| Superadmin | TC-SA-01…13 |
| Components | TC-CMP-01…16 |
| Brands & Suppliers | TC-BRD/SUP |
| PCBs | TC-PCB-01…07 |
| Products | TC-PRD-01…09 |
| Custom Products | TC-CPR-01…07 |
| Inventory Ledger | TC-INV-01…16 |
| Production Lifecycle | TC-PROD-01…14 |
| Readiness & Planner | TC-RDY-01…05 |
| Purchasing | TC-PUR-01…13 |
| Dashboard & Reports | TC-DSH / TC-RPT |
| Module Licensing | TC-MOD-01…07 |
| Search & Launchpad | TC-SRCH / TC-LP |
| Data Provider | TC-BOOT-01…05 |
| Errors & Shape | TC-ERR-01…06 |
| Audit & Soft-Delete | TC-AUD-01…05 |
| Regression | TC-REG-01…06 |
| Non-Functional | TC-NFR-01…05 |

_Last updated: 2026-07-31._
