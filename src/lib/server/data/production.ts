/**
 * Production order lifecycle (mock/DB). The four stages of a shop-floor batch
 * (ARCHITECTURE.md §7b), all going through `withTenant` (one transaction each):
 *
 *   STAGE 1 create   → production_orders(Draft) + exploded production_order_items
 *                      (required_qty = Σ pcb_line.qty × product_pcbs.qty × order.qty)
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
 *
 * Mock mode: reads come from src/mockdata; writes are rejected 400 mock_read_only.
 */
import { Prisma } from "@/generated/prisma/client";
import { isTesting } from "@/lib/config";
import { withTenant, type TenantContext, type TxClient } from "@/lib/prisma";
import { ApiError, Errors } from "@/lib/server/http";
import { assertPermission } from "@/lib/server/rbac";
import { requireSession } from "@/lib/server/session";
import { isUuid } from "@/lib/server/data/util";
import { PRODUCTION_ORDERS } from "@/mockdata/production";
import { PRODUCTION_YIELD, type MonthlyYield } from "@/mockdata/reports";

// ── view shapes (mirror src/mockdata/production.ts so the kanban swaps sources) ──
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

const mockReadOnly = () =>
  new ApiError(400, "mock_read_only", "Production writes are not available in mock mode (isTesting=true).");

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
    select: { id: true, status: true, order_no: true },
  });
  if (!po) throw Errors.notFound("Production order");
  return po;
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
  if (isTesting) {
    return PRODUCTION_ORDERS.map((o) => ({ ...o, targetDate: null }));
  }
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
  if (isTesting) throw mockReadOnly();
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
  if (isTesting) throw mockReadOnly();
  return guarded("production_order.create", async (tx, ctx) => {
    const product = await tx.products.findFirst({
      where: {
        deleted_at: null,
        ...(isUuid(input.product) ? { id: input.product } : { OR: [{ slug: input.product }, { code: input.product }] }),
      },
      select: { id: true, name: true },
    });
    if (!product) throw Errors.badRequest("Unknown product", { product: input.product });

    const bom = await tx.bom_versions.findFirst({
      where: { product_id: product.id, status: "Active", deleted_at: null },
      select: { id: true },
    });
    if (!bom) throw Errors.conflict("Product has no Active BOM version to build against");

    // Explode demand per component: Σ (pcb_line.qty × product_pcbs.qty) × order.qty.
    const demand = await tx.$queryRaw<{ componentId: string; perUnit: number }[]>`
      SELECT pl.component_id AS "componentId", SUM(pl.qty * pp.qty)::float8 AS "perUnit"
      FROM product_pcbs pp
      JOIN pcb_revisions pr ON pr.id = pp.pcb_revision_id
      JOIN pcb_lines pl ON pl.pcb_revision_id = pr.id AND pl.deleted_at IS NULL
      WHERE pp.bom_version_id = ${bom.id}::uuid AND pp.deleted_at IS NULL
      GROUP BY pl.component_id`;
    if (!demand.length) throw Errors.conflict("Active BOM has no component lines to plan");

    const audit = { company_id: ctx.companyId, created_by: ctx.userId, updated_by: ctx.userId };
    const orderNo = await nextOrderNo(tx);

    const order = await tx.production_orders.create({
      data: {
        ...audit,
        order_no: orderNo,
        product_id: product.id,
        bom_version_id: bom.id,
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
  if (isTesting) throw mockReadOnly();
  return guarded("production_order.edit", async (tx, ctx) => {
    const po = await resolveProductionOrder(tx, orderNo);
    if (po.status !== "Draft") throw Errors.conflict(`Order is not in Draft (status: ${po.status.replace("_", " ")})`);

    const items = await tx.production_order_items.findMany({
      where: { production_order_id: po.id, deleted_at: null, status: "pending" },
      select: { id: true, component_id: true, required_qty: true },
    });
    if (!items.length) throw Errors.conflict("Order has no pending items to allocate");

    // Pre-check availability for EVERY item first — allocation is all-or-nothing.
    type Bin = { variantId: string; warehouseId: string; locationId: string; available: number };
    const plan: { itemId: string; picks: { bin: Bin; qty: number }[] }[] = [];
    const shorts: { componentId: string; required: number; available: number }[] = [];

    for (const item of items) {
      const required = Number(item.required_qty);
      const bins = await tx.$queryRaw<Bin[]>`
        SELECT ib.component_brand_variant_id AS "variantId", ib.warehouse_id AS "warehouseId",
               ib.location_id AS "locationId", ib.available::float8 AS available
        FROM inventory_balances ib
        JOIN component_brand_variants v ON v.id = ib.component_brand_variant_id
        WHERE v.component_id = ${item.component_id}::uuid AND ib.available > 0 AND ib.deleted_at IS NULL
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
      throw Errors.conflict("Insufficient stock to allocate this batch", { shorts });
    }

    const audit = { company_id: ctx.companyId, created_by: ctx.userId, updated_by: ctx.userId };
    let allocated = 0;
    for (const { itemId, picks } of plan) {
      for (const { bin, qty } of picks) {
        await tx.production_material_moves.create({
          data: {
            ...audit,
            production_order_item_id: itemId,
            kind: "allocation",
            component_brand_variant_id: bin.variantId,
            warehouse_id: bin.warehouseId,
            location_id: bin.locationId,
            qty,
          },
        });
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
  if (isTesting) throw mockReadOnly();
  return guarded("production_order.edit", async (tx, ctx) => {
    await assertPermission(tx, ctx, "inventory.create"); // consumption writes the ledger

    const po = await resolveProductionOrder(tx, orderNo);
    if (po.status !== "Ready") throw Errors.conflict(`Order is not Ready to consume (status: ${po.status.replace("_", " ")})`);

    // Open reservations (not yet released/consumed) → the material to issue.
    const allocations = await tx.production_material_moves.findMany({
      where: { kind: "allocation", released_at: null, deleted_at: null, production_order_items: { production_order_id: po.id } },
      select: { id: true, production_order_item_id: true, component_brand_variant_id: true, warehouse_id: true, location_id: true, qty: true },
    });
    if (!allocations.length) throw Errors.conflict("Order has no open allocations to consume");

    const now = new Date();
    let consumed = 0;
    for (const a of allocations) {
      // Issue: append a CONSUMPTION ledger row (on_hand −qty) …
      await tx.inventory_transactions.create({
        data: {
          company_id: ctx.companyId,
          type: "CONSUMPTION",
          component_brand_variant_id: a.component_brand_variant_id,
          warehouse_id: a.warehouse_id,
          location_id: a.location_id,
          qty_delta: -Number(a.qty),
          ref_type: "production_order",
          ref_id: po.id,
          reason: `Consumed by ${orderNo}`,
          created_by: ctx.userId,
        },
      });
      // … record the consumption move …
      await tx.production_material_moves.create({
        data: {
          company_id: ctx.companyId, created_by: ctx.userId, updated_by: ctx.userId,
          production_order_item_id: a.production_order_item_id,
          kind: "consumption",
          component_brand_variant_id: a.component_brand_variant_id,
          warehouse_id: a.warehouse_id,
          location_id: a.location_id,
          qty: a.qty,
        },
      });
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

// ── STAGE 4 — complete (close the batch) ─────────────────────────────────────────
export async function completeProductionOrder(orderNo: string): Promise<{ order: string }> {
  if (isTesting) throw mockReadOnly();
  return guarded("production_order.edit", async (tx, ctx) => {
    const po = await resolveProductionOrder(tx, orderNo);
    if (po.status !== "In_Progress") {
      throw Errors.conflict(`Order is not In Progress (status: ${po.status.replace("_", " ")})`);
    }
    // Finished-goods stock for the product is not modelled: the inventory ledger is
    // keyed on component brand variants, and a product is not a component. Closing the
    // batch = status → Completed; the consumed components are already off the ledger.
    await tx.production_orders.update({ where: { id: po.id }, data: { status: "Completed", updated_by: ctx.userId } });
    return { order: orderNo };
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
  if (isTesting) return PRODUCTION_YIELD;
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
