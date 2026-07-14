/**
 * Purchasing data access (mock/DB). The DB stores PRs/POs properly normalized
 * (header + items, ARCHITECTURE.md §7c); the views returned here are FLATTENED
 * one-row-per-item to match the UI (and mockdata) shape.
 *
 * Lifecycle implemented:
 *   create PR  → purchase_requests(status Submitted) + one item
 *   approve PR → approvals rows (manager + procurement), status → 'PO Created',
 *                creates purchase_orders(status Sent) + items (PR-line traceability)
 *   receive PO → goods-in: appends inventory_transactions(type='IN',
 *                ref_type='purchase_order_item') into the default bin, bumps
 *                received_qty, PO → Completed. Stock is NEVER written directly.
 */
import { withTenant, type TenantContext, type TxClient } from "@/lib/prisma";
import { Errors } from "@/lib/server/http";
import { assertPermission } from "@/lib/server/rbac";
import { requireSession } from "@/lib/server/session";
import { isUuid } from "@/lib/server/data/util";
import { formatINR, formatLeadTime } from "@/lib/catalog";

// Flattened one-row-per-item view shapes, consumed directly by the purchasing pages.
export interface PurchaseRequestView {
  prId: string;
  componentId: string; // genericPN
  componentName: string;
  brandId: string; // brand slug
  brandName: string;
  supplierId: string; // supplier slug
  supplierName: string;
  qty: number;
  totalCost: string; // formatted ₹
  status: "Draft" | "Pending Approval" | "Sent" | "Approved";
  date: string;
}

export interface PurchaseOrderView {
  poId: string;
  prId: string;
  componentName: string;
  brandName: string;
  supplierName: string;
  qty: number;
  totalCost: string;
  status: "Sent" | "Dispatched" | "Completed";
  date: string;
}

export interface CreatePrInput {
  componentPN: string;
  brandSlug: string;
  supplierSlug: string;
  qty: number;
  remarks?: string;
}

async function guarded<T>(perm: string, fn: (tx: TxClient, ctx: TenantContext) => Promise<T>): Promise<T> {
  const ctx = await requireSession();
  return withTenant(ctx, async (tx) => {
    await assertPermission(tx, ctx, perm);
    return fn(tx, ctx);
  });
}

/** DB pr_status → the simplified status set the UI renders. */
function prStatusToView(s: string): PurchaseRequestView["status"] {
  if (s === "Draft") return "Draft";
  if (s === "Submitted" || s === "Manager Approved") return "Pending Approval";
  return "Approved"; // Procurement Approved | PO Created
}

const dateOf = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

// ── reads ────────────────────────────────────────────────────────────────────

export async function listPurchaseRequests(): Promise<PurchaseRequestView[]> {
  return guarded("purchase_request.view", async (tx) => {
    const rows = await tx.$queryRaw<{
      prNo: string; status: string; date: Date; qty: number; lineTotal: number | null;
      genericPN: string; componentName: string; brandSlug: string | null; brandName: string | null;
      supplierSlug: string | null; supplierName: string | null;
    }[]>`
      SELECT pr.pr_no AS "prNo", pr.status::text AS status, pr.request_date AS date,
             pri.qty::float8 AS qty, pri.line_total::float8 AS "lineTotal",
             c.generic_pn AS "genericPN", c.name AS "componentName",
             b.slug AS "brandSlug", b.name AS "brandName",
             s.slug AS "supplierSlug", s.name AS "supplierName"
      FROM purchase_requests pr
      JOIN purchase_request_items pri ON pri.purchase_request_id = pr.id AND pri.deleted_at IS NULL
      JOIN components c ON c.id = pri.component_id
      LEFT JOIN brands b ON b.id = pri.brand_id
      LEFT JOIN suppliers s ON s.id = pri.supplier_id
      WHERE pr.deleted_at IS NULL AND pr.status NOT IN ('Rejected','Cancelled')
      ORDER BY pr.request_date DESC, pr.pr_no DESC`;
    return rows.map((r) => ({
      prId: r.prNo,
      componentId: r.genericPN,
      componentName: r.componentName,
      brandId: r.brandSlug ?? "",
      brandName: r.brandName ?? "—",
      supplierId: r.supplierSlug ?? "",
      supplierName: r.supplierName ?? "—",
      qty: r.qty,
      totalCost: formatINR(r.lineTotal ?? 0),
      status: prStatusToView(r.status),
      date: dateOf(r.date),
    }));
  });
}

export async function listPurchaseOrders(): Promise<PurchaseOrderView[]> {
  return guarded("purchase_order.view", async (tx) => {
    const rows = await tx.$queryRaw<{
      poNo: string; prNo: string | null; status: string; date: Date; qty: number;
      lineTotal: number | null; componentName: string; brandName: string | null; supplierName: string;
    }[]>`
      SELECT po.po_no AS "poNo", pr.pr_no AS "prNo", po.status::text AS status, po.order_date AS date,
             poi.qty::float8 AS qty, poi.line_total::float8 AS "lineTotal",
             c.name AS "componentName", b.name AS "brandName", s.name AS "supplierName"
      FROM purchase_orders po
      LEFT JOIN purchase_requests pr ON pr.id = po.pr_id
      JOIN purchase_order_items poi ON poi.purchase_order_id = po.id AND poi.deleted_at IS NULL
      JOIN components c ON c.id = poi.component_id
      LEFT JOIN brands b ON b.id = poi.brand_id
      JOIN suppliers s ON s.id = po.supplier_id
      WHERE po.deleted_at IS NULL AND po.status <> 'Cancelled'
      ORDER BY po.order_date DESC, po.po_no DESC`;
    return rows.map((r) => ({
      poId: r.poNo,
      prId: r.prNo ?? "—",
      componentName: r.componentName,
      brandName: r.brandName ?? "—",
      supplierName: r.supplierName,
      qty: r.qty,
      totalCost: formatINR(r.lineTotal ?? 0),
      status: (r.status === "Draft" ? "Sent" : r.status) as PurchaseOrderView["status"],
      date: dateOf(r.date),
    }));
  });
}

// ── writes ───────────────────────────────────────────────────────────────────

async function nextDocNo(tx: TxClient, table: "purchase_requests" | "purchase_orders", prefix: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const no = `${prefix}-${Math.floor(100000 + Math.random() * 900000)}`;
    const clash =
      table === "purchase_requests"
        ? await tx.purchase_requests.findFirst({ where: { pr_no: no }, select: { id: true } })
        : await tx.purchase_orders.findFirst({ where: { po_no: no }, select: { id: true } });
    if (!clash) return no;
  }
  throw Errors.conflict("Could not allocate a document number");
}

export async function createPurchaseRequest(input: CreatePrInput): Promise<PurchaseRequestView> {
  return guarded("purchase_request.create", async (tx, ctx) => {
    const component = await tx.components.findFirst({
      where: { generic_pn: input.componentPN, deleted_at: null },
      select: { id: true, name: true },
    });
    if (!component) throw Errors.badRequest("Unknown component", { componentPN: input.componentPN });
    const brand = await tx.brands.findFirst({ where: { slug: input.brandSlug, deleted_at: null }, select: { id: true, name: true } });
    const supplier = await tx.suppliers.findFirst({ where: { slug: input.supplierSlug, deleted_at: null }, select: { id: true, name: true } });
    if (!supplier) throw Errors.badRequest("Unknown supplier", { supplierSlug: input.supplierSlug });

    // Current price from the price book (open row), if any.
    const price = await tx.supplier_component_prices.findFirst({
      where: {
        component_id: component.id, supplier_id: supplier.id,
        ...(brand ? { brand_id: brand.id } : {}), valid_to: null, deleted_at: null,
      },
      select: { price: true },
    });
    const unitPrice = price ? Number(price.price) : null;
    const lineTotal = unitPrice != null ? unitPrice * input.qty : null;

    const prNo = await nextDocNo(tx, "purchase_requests", "PR");
    const audit = { company_id: ctx.companyId!, created_by: ctx.userId, updated_by: ctx.userId };

    const pr = await tx.purchase_requests.create({
      data: {
        ...audit, pr_no: prNo, status: "Submitted", requested_by: ctx.userId,
        remarks: input.remarks ?? null, total_cost: lineTotal,
      },
      select: { id: true, request_date: true },
    });
    await tx.purchase_request_items.create({
      data: {
        ...audit, purchase_request_id: pr.id, component_id: component.id,
        brand_id: brand?.id ?? null, supplier_id: supplier.id,
        qty: input.qty, unit_price: unitPrice, line_total: lineTotal,
      },
    });

    return {
      prId: prNo,
      componentId: input.componentPN,
      componentName: component.name,
      brandId: input.brandSlug,
      brandName: brand?.name ?? "—",
      supplierId: input.supplierSlug,
      supplierName: supplier.name,
      qty: input.qty,
      totalCost: formatINR(lineTotal ?? 0),
      status: "Pending Approval",
      date: dateOf(pr.request_date),
    };
  });
}

/**
 * Approve a PR end-to-end (the UI has a single Approve button): records the
 * manager + procurement approval steps, moves the PR to 'PO Created', and
 * sources it into ONE purchase order (status Sent) with PR-line traceability.
 */
export async function approvePurchaseRequest(prNo: string): Promise<{ pr: string; po: string }> {
  return guarded("purchase_request.approve", async (tx, ctx) => {
    const pr = await tx.purchase_requests.findFirst({
      where: { pr_no: prNo, deleted_at: null },
      select: { id: true, status: true },
    });
    if (!pr) throw Errors.notFound("Purchase request");
    if (pr.status !== "Submitted" && pr.status !== "Manager_Approved") {
      throw Errors.conflict(`PR is not awaiting approval (status: ${pr.status.replace("_", " ")})`);
    }

    const items = await tx.purchase_request_items.findMany({
      where: { purchase_request_id: pr.id, deleted_at: null },
      select: { id: true, component_id: true, brand_id: true, supplier_id: true, qty: true, unit_price: true, line_total: true },
    });
    if (!items.length) throw Errors.conflict("PR has no items");
    const supplierId = items[0].supplier_id;
    if (!supplierId) throw Errors.conflict("PR item has no supplier to source from");

    const audit = { company_id: ctx.companyId!, created_by: ctx.userId, updated_by: ctx.userId };
    const now = new Date();

    // Approval audit trail — both steps of the chain.
    for (const [seq, step] of [
      [1, "manager"],
      [2, "procurement"],
    ] as const) {
      await tx.approvals.create({
        data: {
          ...audit, entity_type: "purchase_request", entity_id: pr.id,
          step, seq, decision: "Approved", decided_by: ctx.userId, decided_at: now,
        },
      });
    }

    const poNo = await nextDocNo(tx, "purchase_orders", "PO");
    const total = items.reduce((s, i) => s + Number(i.line_total ?? 0), 0);
    const po = await tx.purchase_orders.create({
      data: { ...audit, po_no: poNo, pr_id: pr.id, supplier_id: supplierId, status: "Sent", total_cost: total },
      select: { id: true },
    });
    for (const item of items) {
      await tx.purchase_order_items.create({
        data: {
          ...audit, purchase_order_id: po.id, pr_item_id: item.id,
          component_id: item.component_id, brand_id: item.brand_id,
          qty: item.qty, unit_price: item.unit_price, line_total: item.line_total,
        },
      });
    }
    await tx.purchase_requests.update({ where: { id: pr.id }, data: { status: "PO_Created", updated_by: ctx.userId } });

    return { pr: prNo, po: poNo };
  });
}

/**
 * Receive a PO (goods-in). For each line: append inventory_transactions(type='IN',
 * ref_type='purchase_order_item', ref_id=line) into the default bin — the trigger
 * projects balances — and set received_qty. PO → Completed.
 */
export async function receivePurchaseOrder(poNo: string): Promise<{ po: string; linesReceived: number }> {
  return guarded("purchase_order.edit", async (tx, ctx) => {
    await assertPermission(tx, ctx, "inventory.create"); // goods-in writes the ledger

    const po = await tx.purchase_orders.findFirst({
      where: { po_no: poNo, deleted_at: null },
      select: { id: true, status: true },
    });
    if (!po) throw Errors.notFound("Purchase order");
    if (po.status === "Completed") throw Errors.conflict("PO already received");

    const items = await tx.purchase_order_items.findMany({
      where: { purchase_order_id: po.id, deleted_at: null },
      select: { id: true, component_id: true, brand_id: true, qty: true, received_qty: true },
    });
    if (!items.length) throw Errors.conflict("PO has no items");

    // Default putaway bin (is_default bin of the first warehouse).
    const bin = await tx.storage_locations.findFirst({
      where: { kind: "bin", is_default: true, deleted_at: null },
      select: { id: true, warehouse_id: true },
    });
    if (!bin) throw Errors.conflict("No default bin configured for goods-in");

    let received = 0;
    for (const item of items) {
      const remaining = Number(item.qty) - Number(item.received_qty);
      if (remaining <= 0) continue;
      if (!item.brand_id) throw Errors.conflict("PO line has no brand — cannot resolve a stock variant");
      const variant = await tx.component_brand_variants.findFirst({
        where: { component_id: item.component_id, brand_id: item.brand_id, deleted_at: null },
        select: { id: true },
      });
      if (!variant) throw Errors.conflict("No brand variant exists for a PO line component/brand");

      await tx.inventory_transactions.create({
        data: {
          company_id: ctx.companyId!,
          type: "IN",
          component_brand_variant_id: variant.id,
          warehouse_id: bin.warehouse_id,
          location_id: bin.id,
          qty_delta: remaining,
          ref_type: "purchase_order_item",
          ref_id: item.id,
          reason: `Goods-in ${poNo}`,
          created_by: ctx.userId,
        },
      });
      await tx.purchase_order_items.update({
        where: { id: item.id },
        data: { received_qty: item.qty, updated_by: ctx.userId },
      });
      received++;
    }

    await tx.purchase_orders.update({ where: { id: po.id }, data: { status: "Completed", updated_by: ctx.userId } });
    return { po: poNo, linesReceived: received };
  });
}

// ── Sourcing recommendations ─────────────────────────────────────────────────────
export interface SourcingRecommendation {
  supplierId: string; // supplier slug
  supplierName: string;
  brandId: string; // brand slug
  brandName: string;
  price: string; // formatted ₹
  leadTime: string;
}

export interface RecommendationsView {
  componentPN: string;
  componentName: string;
  suggestedQty: number;
  recommendations: SourcingRecommendation[];
}

/**
 * Supplier sourcing options for a component. `componentKey` (generic PN / slug /
 * uuid) omitted → auto-pick the biggest current BOM shortage, so the PR screen
 * lands on a real, actionable part. suggestedQty is that shortage (per single
 * build unit); for an explicit component it falls back to its reorder qty.
 */
export async function getRecommendations(componentKey?: string): Promise<RecommendationsView> {
  return guarded("purchase_request.view", async (tx) => {
    let comp: { id: string; generic_pn: string; name: string } | null = null;
    let suggestedQty = 0;

    if (componentKey) {
      comp = await tx.components.findFirst({
        where: { deleted_at: null, ...(isUuid(componentKey) ? { id: componentKey } : { generic_pn: componentKey }) },
        select: { id: true, generic_pn: true, name: true },
      });
      if (!comp) throw Errors.notFound("Component");
      const [c] = await tx.$queryRaw<{ reorder: number }[]>`
        SELECT COALESCE(reorder_qty, 0)::int AS reorder FROM components WHERE id = ${comp.id}::uuid`;
      suggestedQty = c?.reorder ?? 0;
    } else {
      // Auto-pick the component most below its minimum stock (the natural target
      // for a replenishment PR), with a reorder-based suggested quantity.
      const [top] = await tx.$queryRaw<{
        id: string; generic_pn: string; name: string; reorder: number; deficit: number;
      }[]>`
        WITH bal AS (
          SELECT c.id, c.generic_pn, c.name,
                 COALESCE(c.reorder_qty, 0)::numeric AS reorder_qty,
                 c.min_stock::numeric AS min_stock,
                 COALESCE((
                   SELECT SUM(ib.on_hand) FROM component_brand_variants v
                   LEFT JOIN inventory_balances ib ON ib.component_brand_variant_id = v.id AND ib.deleted_at IS NULL
                   WHERE v.component_id = c.id AND v.deleted_at IS NULL
                 ), 0)::numeric AS on_hand
          FROM components c WHERE c.deleted_at IS NULL
        )
        SELECT id, generic_pn, name, reorder_qty::float8 AS reorder,
               (min_stock - on_hand)::float8 AS deficit
        FROM bal
        WHERE on_hand < min_stock
        ORDER BY (min_stock - on_hand) DESC LIMIT 1`;
      if (top) {
        comp = { id: top.id, generic_pn: top.generic_pn, name: top.name };
        suggestedQty = Math.max(1, Math.ceil(top.reorder > 0 ? top.reorder : top.deficit));
      } else {
        // Nothing below minimum — fall back to the first component alphabetically.
        comp = await tx.components.findFirst({
          where: { deleted_at: null },
          orderBy: { name: "asc" },
          select: { id: true, generic_pn: true, name: true },
        });
        if (!comp) throw Errors.notFound("Component");
        const [c] = await tx.$queryRaw<{ reorder: number }[]>`
          SELECT COALESCE(reorder_qty, 0)::int AS reorder FROM components WHERE id = ${comp.id}::uuid`;
        suggestedQty = Math.max(1, c?.reorder ?? 1);
      }
    }

    const offers = await tx.$queryRaw<{
      supplierId: string; supplierName: string; brandId: string; brandName: string; price: number; leadTimeDays: number | null;
    }[]>`
      SELECT s.slug AS "supplierId", s.name AS "supplierName", b.slug AS "brandId", b.name AS "brandName",
             scp.price::float8 AS price, scp.lead_time_days AS "leadTimeDays"
      FROM supplier_component_prices scp
      JOIN suppliers s ON s.id = scp.supplier_id
      JOIN brands b ON b.id = scp.brand_id
      WHERE scp.component_id = ${comp.id}::uuid AND scp.valid_to IS NULL AND scp.deleted_at IS NULL
      ORDER BY scp.price`;

    return {
      componentPN: comp.generic_pn,
      componentName: comp.name,
      suggestedQty,
      recommendations: offers.map((o) => ({
        supplierId: o.supplierId,
        supplierName: o.supplierName,
        brandId: o.brandId,
        brandName: o.brandName,
        price: formatINR(o.price),
        leadTime: formatLeadTime(o.leadTimeDays ?? 0),
      })),
    };
  });
}
