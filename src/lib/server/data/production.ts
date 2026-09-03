/**
 * Production order lifecycle (mock/DB). The four stages of a shop-floor batch
 * (ARCHITECTURE.md §7b), all going through `withTenant` (one transaction each):
 *
 *   STAGE 1 create   → production_orders(Draft) + exploded production_order_items.
 *                      Post-B3 the explosion recurses item_bom_lines from the
 *                      product's Active item_bom_versions (universal BOM) — leaves
 *                      (no Active sub-BOM) become production_order_items.
 *                      pre-B3 was: Σ pcb_line.qty × product_pcbs.qty × order.qty.
 *   STAGE 2 allocate → reserve stock: production_material_moves(kind='allocation')
 *                      per item across its brand variants; the DB trigger bumps
 *                      inventory_balances.reserved. Atomic: if ANY item is short,
 *                      nothing is reserved (409). Order → 'Ready', items → allocated.
 *   STAGE 3 consume  → issue to the build: for each open allocation, append
 *                      inventory_transactions(type='CONSUMPTION', ref='production_order')
 *                      and release the reservation (released_at → trigger frees reserved).
 *                      Net: on_hand −qty, reserved −qty. Items → consumed, order → In Progress.
 *   STAGE 4 complete → close the batch: order → 'Completed'. (Finished-goods stock for
 *                      the *product* is not modelled — the ledger is keyed on component
 *                      brand variants, and products aren't components. See note below.)
 *
 * Plus `getYieldReport` — monthly finished-batch output for the Reports chart.
 */
import { Prisma } from "@/generated/prisma/client";
import { withTenant, type TenantContext, type TxClient } from "@/lib/prisma";
import { Errors } from "@/lib/server/http";
import { assertPermission } from "@/lib/server/rbac";
import { requireSession } from "@/lib/server/session";
import { isUuid } from "@/lib/server/data/util";
import { pickOutboundLot } from "@/lib/server/data/inventory";
import { formatINR, formatLeadTime } from "@/lib/catalog";

/** A month bucket of finished-batch output for the Reports yield chart. */
export interface MonthlyYield {
  month: string;
  yield: number;
}

// ── view shapes ────────────────────────────────────────────────────────────────
export interface ProductionOrderView {
  id: string; // order_no (business key)
  product: string;
  qty: number;
  status: "Draft" | "Ready" | "In Progress" | "Completed";
  targetDate: string | null;
}

export interface ProductionItemView {
  id: string; // production_order_item uuid
  genericPN: string;
  componentName: string;
  requiredQty: number;
  allocated: number; // open reservations
  consumed: number; // issued to the build
  available: number; // free stock across the component's variants
  status: "pending" | "allocated" | "consumed" | "short";
}

export interface CreateProductionOrderInput {
  product: string; // uuid | slug | code
  qty: number;
  targetDate?: string; // ISO date
}

async function guarded<T>(perm: string, fn: (tx: TxClient, ctx: TenantContext) => Promise<T>): Promise<T> {
  const ctx = await requireSession();
  return withTenant(ctx, async (tx) => {
    await assertPermission(tx, ctx, perm);
    return fn(tx, ctx);
  });
}

const dateOf = (d: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : null);

/** DB status text ('In Progress' via ::text) → the union the UI renders. */
function orderStatusToView(s: string): ProductionOrderView["status"] {
  return s as ProductionOrderView["status"];
}

async function resolveProductionOrder(tx: TxClient, orderNo: string) {
  const po = await tx.production_orders.findFirst({
    where: { order_no: orderNo, deleted_at: null },
    // product_id + qty are needed by STAGE 4 (F7 finished-goods receipt);
    // cheap to always select and harmless to the other stages.
    select: { id: true, status: true, order_no: true, product_id: true, qty: true },
  });
  if (!po) throw Errors.notFound("Production order");
  return { ...po, productId: po.product_id };
}

async function nextOrderNo(tx: TxClient): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const no = `MO-${Math.floor(100000 + Math.random() * 900000)}`;
    const clash = await tx.production_orders.findFirst({ where: { order_no: no }, select: { id: true } });
    if (!clash) return no;
  }
  throw Errors.conflict("Could not allocate a production order number");
}

// ── reads ────────────────────────────────────────────────────────────────────
export async function listProductionOrders(): Promise<ProductionOrderView[]> {
  return guarded("production_order.view", async (tx) => {
    const rows = await tx.$queryRaw<{ id: string; product: string; qty: number; status: string; targetDate: Date | null }[]>`
      SELECT po.order_no AS id, p.name AS product, po.qty::int AS qty,
             po.status::text AS status, po.target_date AS "targetDate"
      FROM production_orders po
      JOIN products p ON p.id = po.product_id
      WHERE po.deleted_at IS NULL AND po.status <> 'Cancelled'
      ORDER BY po.created_at DESC, po.order_no DESC`;
    return rows.map((r) => ({
      id: r.id,
      product: r.product,
      qty: r.qty,
      status: orderStatusToView(r.status),
      targetDate: dateOf(r.targetDate),
    }));
  });
}

export async function getProductionOrderItems(orderNo: string): Promise<ProductionItemView[]> {
  return guarded("production_order.view", async (tx) => {
    const po = await resolveProductionOrder(tx, orderNo);
    return tx.$queryRaw<ProductionItemView[]>`
      SELECT poi.id, c.generic_pn AS "genericPN", c.name AS "componentName",
             poi.required_qty::float8 AS "requiredQty", poi.status::text AS status,
             COALESCE((SELECT SUM(mm.qty) FROM production_material_moves mm
                       WHERE mm.production_order_item_id = poi.id AND mm.kind = 'allocation'
                         AND mm.released_at IS NULL AND mm.deleted_at IS NULL), 0)::float8 AS allocated,
             COALESCE((SELECT SUM(mm.qty) FROM production_material_moves mm
                       WHERE mm.production_order_item_id = poi.id AND mm.kind = 'consumption'
                         AND mm.deleted_at IS NULL), 0)::float8 AS consumed,
             COALESCE((SELECT SUM(ib.available) FROM inventory_balances ib
                       JOIN component_brand_variants v ON v.id = ib.component_brand_variant_id
                       WHERE v.component_id = poi.component_id AND ib.deleted_at IS NULL), 0)::float8 AS available
      FROM production_order_items poi
      JOIN components c ON c.id = poi.component_id
      WHERE poi.production_order_id = ${po.id}::uuid AND poi.deleted_at IS NULL
      ORDER BY c.name`;
  });
}

// ── STAGE 1 — create + explode BOM ─────────────────────────────────────────────
export async function createProductionOrder(input: CreateProductionOrderInput): Promise<ProductionOrderView> {
  return guarded("production_order.create", async (tx, ctx) => {
    // Parent resolution: the legacy `tx.products.findFirst` path is gone
    // now that `production_orders.product_id` FK-targets `items(id)` (see
    // migration 20260903000002_production_orders_items_fk). `input.product`
    // accepts an item uuid or code.
    const productRow = (await tx.$queryRaw<{ id: string; name: string }[]>`
      SELECT id, name
        FROM items
       WHERE deleted_at IS NULL
         AND item_type = 'assembled'::item_type
         AND ${isUuid(input.product)
              ? Prisma.sql`(id = ${input.product}::uuid OR code = ${input.product})`
              : Prisma.sql`code = ${input.product}`}
       LIMIT 1`)[0];
    if (!productRow) throw Errors.badRequest("Unknown product", { product: input.product });
    const product = productRow;

    // B3: source the explosion from the universal BOM (item_bom_versions +
    // recursive item_bom_lines). `production_orders.bom_version_id`
    // snapshots the item_bom_versions.id — the legacy bom_versions table
    // was dropped in the D3/D4 slice. Historical rows that recorded a
    // legacy uuid stay untouched; the FK constraint was dropped alongside
    // the table so those orphan pointers are harmless.
    const activeUniv = await tx.$queryRaw<{ id: string }[]>`
      SELECT id
        FROM item_bom_versions
       WHERE parent_item_id = ${product.id}::uuid
         AND status = 'Active'
         AND deleted_at IS NULL
       LIMIT 1`;
    if (!activeUniv[0]) throw Errors.conflict("Product has no Active BOM version to build against");
    const universalVersionId = activeUniv[0].id;
    const snapshotBomVersionId = universalVersionId;

    // Recursive explode: walk item_bom_lines from the Active version, recursing
    // into every child that has its own Active BOM. Only leaves (no Active BOM
    // below them) become production_order_items. depth guard is a belt-and-
    // braces defence — assertNoCycles already blocks cycles at write time.
    const demand = await tx.$queryRaw<{ componentId: string; perUnit: number }[]>`
      WITH RECURSIVE explode(child, qty, depth) AS (
        SELECT bl.child_item_id, bl.qty::float8 AS qty, 1
          FROM item_bom_lines bl
         WHERE bl.bom_version_id = ${universalVersionId}::uuid
           AND bl.deleted_at IS NULL
        UNION ALL
        SELECT bl.child_item_id, (e.qty * bl.qty)::float8, e.depth + 1
          FROM explode e
          JOIN item_bom_versions cbv ON cbv.parent_item_id = e.child
                                    AND cbv.status = 'Active'
                                    AND cbv.deleted_at IS NULL
          JOIN item_bom_lines bl ON bl.bom_version_id = cbv.id
                                AND bl.deleted_at IS NULL
         WHERE e.depth < 20
      )
      SELECT e.child::text AS "componentId", SUM(e.qty)::float8 AS "perUnit"
        FROM explode e
       WHERE NOT EXISTS (
         SELECT 1 FROM item_bom_versions bv2
          WHERE bv2.parent_item_id = e.child
            AND bv2.status = 'Active'
            AND bv2.deleted_at IS NULL
       )
       GROUP BY e.child`;
    if (!demand.length) throw Errors.conflict("Active BOM has no component lines to plan");

    // Orphan check (was: leaves must exist in `components`) removed with
    // the FK repoint — `production_order_items.component_id` now FKs to
    // `items(id)`, and the recursive explode above already guarantees every
    // leaf comes from `item_bom_lines.child_item_id` which itself FKs to
    // items. The DB enforces the invariant now instead of us pre-checking it.

    const audit = { company_id: ctx.companyId!, created_by: ctx.userId, updated_by: ctx.userId };
    const orderNo = await nextOrderNo(tx);

    const order = await tx.production_orders.create({
      data: {
        ...audit,
        order_no: orderNo,
        product_id: product.id,
        bom_version_id: snapshotBomVersionId,
        qty: input.qty,
        status: "Draft",
        target_date: input.targetDate ? new Date(input.targetDate) : null,
      },
      select: { id: true, target_date: true },
    });

    for (const d of demand) {
      await tx.production_order_items.create({
        data: {
          ...audit,
          production_order_id: order.id,
          component_id: d.componentId,
          required_qty: d.perUnit * input.qty,
          status: "pending",
        },
      });
    }

    return {
      id: orderNo,
      product: product.name,
      qty: input.qty,
      status: "Draft",
      targetDate: dateOf(order.target_date),
    };
  });
}

// ── STAGE 2 — allocate (reserve) ────────────────────────────────────────────────
export async function allocateProductionOrder(orderNo: string): Promise<{ order: string; allocated: number }> {
  return guarded("production_order.edit", async (tx, ctx) => {
    const po = await resolveProductionOrder(tx, orderNo);
    if (po.status !== "Draft") throw Errors.conflict(`Order is not in Draft (status: ${po.status.replace("_", " ")})`);

    const items = await tx.production_order_items.findMany({
      where: { production_order_id: po.id, deleted_at: null, status: "pending" },
      select: { id: true, component_id: true, required_qty: true },
    });
    if (!items.length) throw Errors.conflict("Order has no pending items to allocate");

    // Pre-check availability for EVERY item first — allocation is all-or-nothing.
    // `variantId` here is the universal item_variant_id. BOM-imported items
    // don't have a legacy component_brand_variants row, so the old
    // `JOIN component_brand_variants v ON v.component_id = <leaf>` returned
    // zero rows even when balances were present. We now walk item_variants
    // straight through `v.item_id`, and the sync trigger on writes back-
    // fills component_brand_variant_id whenever a legacy twin still exists.
    type Bin = { variantId: string; warehouseId: string; locationId: string; available: number };
    const plan: { itemId: string; picks: { bin: Bin; qty: number }[] }[] = [];
    const shorts: { componentId: string; required: number; available: number }[] = [];

    for (const item of items) {
      const required = Number(item.required_qty);
      const bins = await tx.$queryRaw<Bin[]>`
        SELECT ib.item_variant_id  AS "variantId",
               ib.warehouse_id     AS "warehouseId",
               ib.location_id      AS "locationId",
               ib.available::float8 AS available
          FROM inventory_balances ib
          JOIN item_variants v ON v.id = ib.item_variant_id AND v.deleted_at IS NULL
         WHERE v.item_id = ${item.component_id}::uuid
           AND ib.available > 0
           AND ib.deleted_at IS NULL
         ORDER BY ib.available DESC`;
      const total = bins.reduce((s, b) => s + b.available, 0);
      if (total < required) {
        shorts.push({ componentId: item.component_id, required, available: total });
        continue;
      }
      let remaining = required;
      const picks: { bin: Bin; qty: number }[] = [];
      for (const bin of bins) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, bin.available);
        picks.push({ bin, qty: take });
        remaining -= take;
      }
      plan.push({ itemId: item.id, picks });
    }

    if (shorts.length) {
      throw Errors.conflict(
        "Insufficient stock to allocate this batch",
        { shorts },
        "One or more BOM items are short — receive more stock or create purchase requests for the shortages, then retry allocation.",
      );
    }

    let allocated = 0;
    for (const { itemId, picks } of plan) {
      for (const { bin, qty } of picks) {
        // Raw INSERT because the Prisma model still declares only the
        // legacy component_brand_variant_id column (the `item_variant_id`
        // field was added to the DB but hasn't been reflected in
        // schema.prisma yet). The sync_item_variant_id BEFORE INSERT
        // trigger back-fills the legacy column when a CBV twin exists,
        // and leaves it NULL for BOM-imported variants — safe because
        // production_material_moves.component_brand_variant_id is nullable.
        await tx.$executeRaw`
          INSERT INTO production_material_moves
            (company_id, production_order_item_id, kind, item_variant_id,
             warehouse_id, location_id, qty, created_by, updated_by)
          VALUES
            (${ctx.companyId!}::uuid, ${itemId}::uuid, 'allocation'::material_move_kind,
             ${bin.variantId}::uuid, ${bin.warehouseId}::uuid, ${bin.locationId}::uuid,
             ${qty}, ${ctx.userId}::uuid, ${ctx.userId}::uuid)`;
        allocated++;
      }
      await tx.production_order_items.update({ where: { id: itemId }, data: { status: "allocated", updated_by: ctx.userId } });
    }

    await tx.production_orders.update({ where: { id: po.id }, data: { status: "Ready", updated_by: ctx.userId } });
    return { order: orderNo, allocated };
  });
}

// ── STAGE 3 — consume (issue to the build) ──────────────────────────────────────
export async function consumeProductionOrder(orderNo: string): Promise<{ order: string; consumed: number }> {
  return guarded("production_order.edit", async (tx, ctx) => {
    await assertPermission(tx, ctx, "inventory.create"); // consumption writes the ledger

    const po = await resolveProductionOrder(tx, orderNo);
    if (po.status !== "Ready") throw Errors.conflict(`Order is not Ready to consume (status: ${po.status.replace("_", " ")})`);

    // Open reservations (not yet released/consumed) → the material to issue.
    // Reads item_variant_id (universal, NOT NULL) — the legacy CBV column
    // is nullable for BOM-imported variants without a legacy twin, so it
    // isn't safe to key on. Raw SELECT because the Prisma model doesn't
    // expose item_variant_id yet (see note in allocateProductionOrder).
    const allocations = await tx.$queryRaw<{
      id: string; productionOrderItemId: string; itemVariantId: string;
      warehouseId: string; locationId: string; qty: number;
    }[]>`
      SELECT pmm.id,
             pmm.production_order_item_id AS "productionOrderItemId",
             pmm.item_variant_id          AS "itemVariantId",
             pmm.warehouse_id             AS "warehouseId",
             pmm.location_id              AS "locationId",
             pmm.qty::float8              AS qty
        FROM production_material_moves pmm
        JOIN production_order_items poi
          ON poi.id = pmm.production_order_item_id
       WHERE pmm.kind = 'allocation'::material_move_kind
         AND pmm.released_at IS NULL
         AND pmm.deleted_at IS NULL
         AND poi.production_order_id = ${po.id}::uuid`;
    if (!allocations.length) throw Errors.conflict("Order has no open allocations to consume");

    const now = new Date();
    let consumed = 0;
    for (const a of allocations) {
      // Issue: append a CONSUMPTION ledger row (on_hand −qty), FEFO-tagged for traceability.
      const lotId = await pickOutboundLot(tx, ctx, a.itemVariantId, a.locationId);
      await tx.$executeRaw`
        INSERT INTO inventory_transactions
          (company_id, type, item_variant_id, warehouse_id, location_id, qty_delta, lot_id, ref_type, ref_id, reason, created_by)
        VALUES (${ctx.companyId!}::uuid, 'CONSUMPTION'::inventory_txn_type, ${a.itemVariantId}::uuid,
                ${a.warehouseId}::uuid, ${a.locationId}::uuid, ${-Number(a.qty)}, ${lotId}::uuid,
                'production_order', ${po.id}::uuid, ${`Consumed by ${orderNo}`}, ${ctx.userId}::uuid)`;
      // … record the consumption move …
      await tx.$executeRaw`
        INSERT INTO production_material_moves
          (company_id, production_order_item_id, kind, item_variant_id,
           warehouse_id, location_id, qty, created_by, updated_by)
        VALUES
          (${ctx.companyId!}::uuid, ${a.productionOrderItemId}::uuid,
           'consumption'::material_move_kind, ${a.itemVariantId}::uuid,
           ${a.warehouseId}::uuid, ${a.locationId}::uuid, ${a.qty},
           ${ctx.userId}::uuid, ${ctx.userId}::uuid)`;
      // … and release the reservation (trigger frees reserved so it isn't double-counted).
      await tx.production_material_moves.update({ where: { id: a.id }, data: { released_at: now, updated_by: ctx.userId } });
      consumed++;
    }

    await tx.production_order_items.updateMany({
      where: { production_order_id: po.id, deleted_at: null, status: "allocated" },
      data: { status: "consumed", updated_by: ctx.userId },
    });
    await tx.production_orders.update({ where: { id: po.id }, data: { status: "In_Progress", updated_by: ctx.userId } });
    return { order: orderNo, consumed };
  });
}

// ── STAGE 4 — complete (close the batch + receive finished goods) ─────────────────
/**
 * Close the batch AND book the finished units into stock (F7).
 *
 * The product is a universal item (F2 mirrored products → items) with a single
 * manufactured variant (source_kind='manufactured', no brand). F5.4 opened the
 * ledger to manufactured items — component_brand_variant_id is nullable and
 * balances key on item_variant_id — so we can now append a PRODUCTION row
 * (qty_delta = +order.qty) against that variant. The consumed components were
 * already taken off the ledger in STAGE 3, so completing a batch nets:
 * finished-good on_hand +qty, raw components already −consumed.
 *
 * Returns the produced qty + the variant it landed against so the caller can
 * surface a meaningful toast.
 */
export async function completeProductionOrder(orderNo: string): Promise<{ order: string; produced: number; itemVariantId: string }> {
  return guarded("production_order.edit", async (tx, ctx) => {
    await assertPermission(tx, ctx, "inventory.create"); // finished-goods receipt writes the ledger

    const po = await resolveProductionOrder(tx, orderNo);
    if (po.status !== "In_Progress") {
      throw Errors.conflict(`Order is not In Progress (status: ${po.status.replace("_", " ")})`);
    }

    // The product's manufactured variant is where finished units land.
    const [variant] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM item_variants
      WHERE item_id = ${po.productId}::uuid
        AND source_kind = 'manufactured'
        AND deleted_at IS NULL
      LIMIT 1`;
    if (!variant) {
      throw Errors.conflict(
        "This product has no manufactured variant to receive finished units into",
        { productId: po.productId },
        "The universal-item backfill (F2) creates one automatically; if it is missing, re-run the items backfill before completing this batch.",
      );
    }

    // Destination bin: prefer a finished-goods warehouse's default bin, else the
    // tenant default bin (same fallback shape as opening stock / goods-in).
    const [bin] = await tx.$queryRaw<{ id: string; warehouse_id: string }[]>`
      SELECT sl.id, sl.warehouse_id
      FROM storage_locations sl
      JOIN warehouses w ON w.id = sl.warehouse_id AND w.deleted_at IS NULL
      WHERE sl.kind = 'bin' AND sl.is_default = true AND sl.deleted_at IS NULL
      ORDER BY w.is_finished_goods DESC, w.code
      LIMIT 1`;
    if (!bin) {
      throw Errors.conflict(
        "No default bin configured to receive finished goods",
        undefined,
        "Open Inventory → Warehouses and mark one bin as the default (ideally in a finished-goods warehouse) before completing the batch.",
      );
    }

    // Append the finished-goods PRODUCTION row. Only item_variant_id is set —
    // manufactured variants have no CBV, and the sync trigger leaves it NULL.
    // The default-lot + projection triggers handle lot assignment and balances.
    await tx.$executeRaw`
      INSERT INTO inventory_transactions
        (company_id, type, item_variant_id, warehouse_id, location_id, qty_delta, ref_type, ref_id, reason, created_by)
      VALUES (${ctx.companyId!}::uuid, 'PRODUCTION'::inventory_txn_type, ${variant.id}::uuid,
              ${bin.warehouse_id}::uuid, ${bin.id}::uuid, ${Number(po.qty)},
              'production_order', ${po.id}::uuid, ${`Produced by ${orderNo}`}, ${ctx.userId}::uuid)`;

    await tx.production_orders.update({ where: { id: po.id }, data: { status: "Completed", updated_by: ctx.userId } });
    return { order: orderNo, produced: Number(po.qty), itemVariantId: variant.id };
  });
}

// ── cancel (abort before consumption) ────────────────────────────────────────────
/**
 * Cancel a production order. Allowed only before material is consumed (Draft or
 * Ready) — once In Progress the consumed stock is off the ledger and a cancel
 * would require reversing entries. Releases any open allocations so reserved
 * stock is freed (the trigger recomputes reserved), then status → Cancelled.
 */
export async function cancelProductionOrder(orderNo: string): Promise<{ order: string; released: number }> {
  return guarded("production_order.delete", async (tx, ctx) => {
    const po = await resolveProductionOrder(tx, orderNo);
    if (po.status === "Cancelled") throw Errors.conflict("Order is already cancelled");
    if (po.status === "In_Progress" || po.status === "Completed") {
      throw Errors.conflict(
        `Order has been consumed and cannot be cancelled (status: ${po.status.replace("_", " ")})`,
        undefined,
        "Consumed stock is already off the ledger — post reversing stock-in transactions for any returned material instead.",
      );
    }

    // Free any open reservations so the stock returns to available.
    const now = new Date();
    const open = await tx.production_material_moves.findMany({
      where: { kind: "allocation", released_at: null, deleted_at: null, production_order_items: { production_order_id: po.id } },
      select: { id: true },
    });
    for (const move of open) {
      await tx.production_material_moves.update({ where: { id: move.id }, data: { released_at: now, updated_by: ctx.userId } });
    }
    // Return allocated items to pending (there is no cancelled item state).
    await tx.production_order_items.updateMany({
      where: { production_order_id: po.id, deleted_at: null, status: "allocated" },
      data: { status: "pending", updated_by: ctx.userId },
    });
    await tx.production_orders.update({ where: { id: po.id }, data: { status: "Cancelled", updated_by: ctx.userId } });
    return { order: orderNo, released: open.length };
  });
}

// ── Reports — monthly finished-batch output ──────────────────────────────────────
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Last `months` calendar buckets, oldest→newest, as { key: 'YYYY-MM', label: 'Mon' }. */
function recentMonthBuckets(months: number): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ key, label: MONTH_LABELS[d.getMonth()] });
  }
  return out;
}

export async function getYieldReport(range = "6m"): Promise<MonthlyYield[]> {
  const months = Math.min(Math.max(parseInt(range, 10) || 6, 1), 24);
  return guarded("report.view", async (tx) => {
    const rows = await tx.$queryRaw<{ bucket: string; yield: number }[]>`
      SELECT to_char(date_trunc('month', po.updated_at), 'YYYY-MM') AS bucket, SUM(po.qty)::int AS yield
      FROM production_orders po
      WHERE po.deleted_at IS NULL AND po.status = 'Completed'
        AND po.updated_at >= date_trunc('month', now()) - make_interval(months => ${months - 1})
      GROUP BY bucket`;
    const byBucket = new Map(rows.map((r) => [r.bucket, r.yield]));
    return recentMonthBuckets(months).map((b) => ({ month: b.label, yield: byBucket.get(b.key) ?? 0 }));
  });
}

// ── Reports — headline KPI strip + output distribution ────────────────────────────
export interface ReportsSummary {
  totalBatches: number; // completed production orders
  unitsProduced: number; // Σ qty of completed orders
  avgYield: number; // completed / (completed + cancelled) × 100
  avgLeadTimeDays: number; // avg (updated_at − created_at) of completed orders
  distribution: { product: string; units: number }[]; // completed units by product line
}

export async function getReportsSummary(): Promise<ReportsSummary> {
  return guarded("report.view", async (tx) => {
    const [row] = await tx.$queryRaw<{
      totalBatches: number;
      unitsProduced: number;
      completed: number;
      cancelled: number;
      avgLeadTimeDays: number | null;
    }[]>`
      SELECT
        COUNT(*) FILTER (WHERE status = 'Completed')::int AS "totalBatches",
        COALESCE(SUM(qty) FILTER (WHERE status = 'Completed'), 0)::int AS "unitsProduced",
        COUNT(*) FILTER (WHERE status = 'Completed')::int AS completed,
        COUNT(*) FILTER (WHERE status = 'Cancelled')::int AS cancelled,
        AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400.0)
          FILTER (WHERE status = 'Completed')::float8 AS "avgLeadTimeDays"
      FROM production_orders
      WHERE deleted_at IS NULL`;

    const distribution = await tx.$queryRaw<{ product: string; units: number }[]>`
      SELECT p.name AS product, COALESCE(SUM(po.qty), 0)::int AS units
      FROM production_orders po
      JOIN products p ON p.id = po.product_id
      WHERE po.deleted_at IS NULL AND po.status = 'Completed'
      GROUP BY p.name
      ORDER BY units DESC
      LIMIT 6`;

    const closed = row.completed + row.cancelled;
    const avgYield = closed > 0 ? (row.completed / closed) * 100 : 0;
    return {
      totalBatches: row.totalBatches,
      unitsProduced: row.unitsProduced,
      avgYield: Math.round(avgYield * 10) / 10,
      avgLeadTimeDays: row.avgLeadTimeDays != null ? Math.round(row.avgLeadTimeDays * 10) / 10 : 0,
      distribution,
    };
  });
}

// ── Production readiness — batch material audit for a product × qty ──────────────
export interface ReadinessItemView {
  component: string;
  genericPN: string;
  required: number;
  available: number;
  status: boolean; // true = enough stock
}

export interface ReadinessSupplierView {
  brand: string;
  brandId: string;
  supplierId: string;
  supplierName: string;
  price: string;
  leadTime: string;
}

export interface ReadinessView {
  product: string;
  productSlug: string;
  qty: number;
  items: ReadinessItemView[];
  shortComponent: string;
  shortPN: string;
  missingQty: number;
  sourcing: ReadinessSupplierView[];
}

/**
 * Audit whether stock covers a build of `qty` units of a product: per-component
 * required (Σ pcb_line.qty × product_pcbs.qty × qty) vs available (Σ balances).
 * Picks the largest shortage as the "blocked" component and returns its sourcing
 * options from the supplier price book. `productKey` omitted → first product with
 * an Active BOM.
 */
export async function getReadiness(productKey: string | undefined, qty: number): Promise<ReadinessView> {
  const batch = Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 100;
  return guarded("production_order.view", async (tx) => {
    // Resolve the parent from the universal `items` table. The legacy
    // `tx.products.findFirst` path is gone: F5 module consolidation moved
    // every assembled parent onto items, and the products table is empty
    // for freshly-imported tenants. `productKey` accepts either an item
    // uuid or an item code; when omitted, we pick the first assembled
    // item that carries an Active BOM (same fallback intent as before).
    const product = productKey
      ? (await tx.$queryRaw<{ id: string; name: string; code: string }[]>`
          SELECT id, name, code
            FROM items
           WHERE deleted_at IS NULL
             AND item_type = 'assembled'::item_type
             AND ${isUuid(productKey)
                  ? Prisma.sql`(id = ${productKey}::uuid OR code = ${productKey})`
                  : Prisma.sql`code = ${productKey}`}
           LIMIT 1`
        )[0] ?? null
      : (await tx.$queryRaw<{ id: string; name: string; code: string }[]>`
          SELECT i.id, i.name, i.code
            FROM items i
            JOIN item_bom_versions bv ON bv.parent_item_id = i.id
                                      AND bv.status = 'Active'
                                      AND bv.deleted_at IS NULL
           WHERE i.deleted_at IS NULL
             AND i.item_type = 'assembled'::item_type
           ORDER BY i.name LIMIT 1`
        )[0] ?? null;
    if (!product) throw Errors.notFound("Product");

    // Recursive explode + on-hand aggregation. Both now key on the
    // universal item_variants / inventory_balances tables. `demand` picks
    // the true leaves — anything that itself has an Active BOM keeps
    // exploding rather than being counted as raw stock.
    const rows = await tx.$queryRaw<{ genericPN: string; component: string; required: number; available: number }[]>`
      WITH RECURSIVE explode(child, qty, depth) AS (
        SELECT bl.child_item_id, bl.qty::numeric, 1
          FROM item_bom_versions bv
          JOIN item_bom_lines bl ON bl.bom_version_id = bv.id AND bl.deleted_at IS NULL
         WHERE bv.parent_item_id = ${product.id}::uuid
           AND bv.status = 'Active'
           AND bv.deleted_at IS NULL
        UNION ALL
        SELECT bl.child_item_id, (e.qty * bl.qty)::numeric, e.depth + 1
          FROM explode e
          JOIN item_bom_versions cbv ON cbv.parent_item_id = e.child
                                    AND cbv.status = 'Active'
                                    AND cbv.deleted_at IS NULL
          JOIN item_bom_lines bl ON bl.bom_version_id = cbv.id
                                AND bl.deleted_at IS NULL
         WHERE e.depth < 20
      ),
      demand AS (
        SELECT e.child AS component_id, SUM(e.qty)::numeric AS per_unit
          FROM explode e
         WHERE NOT EXISTS (
           SELECT 1 FROM item_bom_versions bv2
            WHERE bv2.parent_item_id = e.child
              AND bv2.status = 'Active'
              AND bv2.deleted_at IS NULL
         )
         GROUP BY e.child
      )
      SELECT COALESCE(i.generic_pn, '') AS "genericPN", i.name AS component,
             (d.per_unit * ${batch})::float8 AS required,
             COALESCE((
               SELECT SUM(ib.available) FROM item_variants v
               LEFT JOIN inventory_balances ib ON ib.item_variant_id = v.id AND ib.deleted_at IS NULL
               WHERE v.item_id = d.component_id AND v.deleted_at IS NULL
             ), 0)::float8 AS available
      FROM demand d JOIN items i ON i.id = d.component_id AND i.deleted_at IS NULL
      ORDER BY i.name`;

    const items: ReadinessItemView[] = rows.map((r) => ({
      component: r.component,
      genericPN: r.genericPN,
      required: r.required,
      available: r.available,
      status: r.available >= r.required,
    }));

    // Largest shortage drives the "production blocked" panel + sourcing.
    const shorts = items.filter((i) => !i.status).sort((a, b) => (b.required - b.available) - (a.required - a.available));
    const shorted = shorts[0];
    const shortComponent = shorted?.component ?? "—";
    const shortPN = shorted?.genericPN ?? "";
    const missingQty = shorted ? Math.ceil(shorted.required - shorted.available) : 0;

    // Sourcing: same supplier price book, joined via the universal items
    // table. `supplier_component_prices.component_id` still FK-targets
    // `components(id)`; F2 mirrored the two id-spaces, so the join to
    // `items` on the same id is transparent for anything that has a legacy
    // twin. Rows without a twin simply carry no supplier offers here —
    // consistent with what the item detail page already shows.
    let sourcing: ReadinessSupplierView[] = [];
    if (shortPN) {
      const offers = await tx.$queryRaw<{
        brandId: string; brand: string; supplierId: string; supplierName: string; price: number; leadTimeDays: number | null;
      }[]>`
        SELECT b.slug AS "brandId", b.name AS brand, s.slug AS "supplierId", s.name AS "supplierName",
               scp.price::float8 AS price, scp.lead_time_days AS "leadTimeDays"
        FROM supplier_component_prices scp
        JOIN items i ON i.id = scp.component_id AND i.deleted_at IS NULL
        JOIN brands b ON b.id = scp.brand_id
        JOIN suppliers s ON s.id = scp.supplier_id
        WHERE i.generic_pn = ${shortPN} AND scp.valid_to IS NULL AND scp.deleted_at IS NULL
        ORDER BY scp.price`;
      sourcing = offers.map((o) => ({
        brand: o.brand,
        brandId: o.brandId,
        supplierId: o.supplierId,
        supplierName: o.supplierName,
        price: formatINR(o.price),
        leadTime: formatLeadTime(o.leadTimeDays ?? 0),
      }));
    }

    return {
      product: product.name,
      // The wire field kept its historical name; the value is now the
      // item's `id` (uuid), so the readiness page's <select> — whose
      // option values are item uuids from /api/items — can round-trip
      // the auto-picked product on first load.
      productSlug: product.id,
      qty: batch,
      items,
      shortComponent,
      shortPN,
      missingQty,
      sourcing,
    };
  });
}
