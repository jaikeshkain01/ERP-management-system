/**
 * Dashboard aggregates (DB-only). Everything the dashboard renders, computed
 * from the normalized tables in one round of queries: inventory valuation,
 * production blockers, purchasing pipeline counts, recent activity, PLUS the
 * catalog-derived panels (product build-readiness, low stock, single-supplier
 * risk, top-consumed, usage impact) that used to be built client-side.
 */
import { withTenant, type TenantContext, type TxClient } from "@/lib/prisma";
import { requireSession } from "@/lib/server/session";
import { assertPermission } from "@/lib/server/rbac";

export interface PurchaseSummaryItem {
  title: string;
  value: number;
  desc: string;
}

export interface BlockerItem {
  product: string;
  missingComp: string;
  qty: number;
}

export interface DashProductionOrder {
  orderId: string;
  product: string;
  qty: number;
  status: "In Progress" | "Completed" | "Draft";
}

export interface ActivityItem {
  text: string;
  time: string;
}

export interface ProductStatusItem {
  product: string;
  status: string;
  buildableQty: number;
}

export interface LowStockItem {
  component: string;
  current: number;
  minimum: number;
  status: "Low" | "Critical";
}

export interface SingleSupplierItem {
  component: string;
  supplier: string;
}

export interface ConsumedComponent {
  component: string;
  monthlyUsage: string;
}

export interface UsageImpactItem {
  component: string;
  usedInProducts: number;
}

export interface CategoryItem {
  name: string;
  value: number;
}

export interface DashboardSummary {
  inventoryValue: number;
  productionBlockers: BlockerItem[];
  purchaseSummary: PurchaseSummaryItem[];
  recentProductionOrders: DashProductionOrder[];
  recentActivities: ActivityItem[];
  categoryDistribution: CategoryItem[];
  // Catalog-derived panels (now computed server-side from the DB).
  productStatus: ProductStatusItem[];
  lowStock: LowStockItem[];
  singleSupplier: SingleSupplierItem[];
  topConsumed: ConsumedComponent[];
  usageImpact: UsageImpactItem[];
}

async function guarded<T>(perm: string, fn: (tx: TxClient, ctx: TenantContext) => Promise<T>): Promise<T> {
  const ctx = await requireSession();
  return withTenant(ctx, async (tx) => {
    await assertPermission(tx, ctx, perm);
    return fn(tx, ctx);
  });
}

/** Human "N mins/hours/days ago" from a timestamp. */
function relTime(ts: Date | string): string {
  const secs = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  const mins = Math.floor(secs / 60);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days >= 1) return `${days} day${days > 1 ? "s" : ""} ago`;
  if (hrs >= 1) return `${hrs} hour${hrs > 1 ? "s" : ""} ago`;
  if (mins >= 1) return `${mins} min${mins > 1 ? "s" : ""} ago`;
  return "just now";
}

/** DB prod_order_status → the simplified set the dashboard renders. */
function dashOrderStatus(s: string): DashProductionOrder["status"] {
  if (s === "Completed") return "Completed";
  if (s === "In_Progress" || s === "In Progress" || s === "Ready") return "In Progress";
  return "Draft";
}

export async function getDashboard(): Promise<DashboardSummary> {
  return guarded("component.view", async (tx) => {
    // ── Inventory valuation: on_hand × cheapest current price for the variant's part ──
    const [{ value }] = await tx.$queryRaw<{ value: number }[]>`
      SELECT COALESCE(SUM(ib.on_hand * COALESCE(price.p, 0)), 0)::float8 AS value
      FROM inventory_balances ib
      JOIN component_brand_variants v ON v.id = ib.component_brand_variant_id
      LEFT JOIN LATERAL (
        SELECT MIN(scp.price) AS p
        FROM supplier_component_prices scp
        WHERE scp.component_id = v.component_id
          AND scp.valid_to IS NULL AND scp.deleted_at IS NULL
      ) price ON TRUE
      WHERE ib.deleted_at IS NULL`;

    // ── Production blockers: components short of the per-unit demand of any Active BOM ──
    const blockerRows = await tx.$queryRaw<{ product: string; missingComp: string; qty: number }[]>`
      WITH demand AS (
        SELECT p.name AS product, pl.component_id, SUM(pl.qty * pp.qty)::numeric AS per_unit
        FROM products p
        JOIN bom_versions bv ON bv.product_id = p.id AND bv.status = 'Active' AND bv.deleted_at IS NULL
        JOIN product_pcbs pp ON pp.bom_version_id = bv.id AND pp.deleted_at IS NULL
        JOIN pcb_revisions pr ON pr.id = pp.pcb_revision_id
        JOIN pcb_lines pl ON pl.pcb_revision_id = pr.id AND pl.deleted_at IS NULL
        WHERE p.deleted_at IS NULL
        GROUP BY p.name, pl.component_id
      ),
      avail AS (
        SELECT v.component_id, COALESCE(SUM(ib.available), 0)::numeric AS available
        FROM component_brand_variants v
        LEFT JOIN inventory_balances ib ON ib.component_brand_variant_id = v.id AND ib.deleted_at IS NULL
        WHERE v.deleted_at IS NULL
        GROUP BY v.component_id
      )
      SELECT d.product, c.name AS "missingComp",
             CEIL(d.per_unit - COALESCE(a.available, 0))::int AS qty
      FROM demand d
      JOIN components c ON c.id = d.component_id
      LEFT JOIN avail a ON a.component_id = d.component_id
      WHERE COALESCE(a.available, 0) < d.per_unit
      ORDER BY qty DESC
      LIMIT 8`;

    // ── Purchasing pipeline counts ──
    const [{ pendingPRs }] = await tx.$queryRaw<{ pendingPRs: number }[]>`
      SELECT COUNT(*)::int AS "pendingPRs" FROM purchase_requests
      WHERE deleted_at IS NULL AND status IN ('Submitted', 'Manager Approved')`;
    const [{ openPOs }] = await tx.$queryRaw<{ openPOs: number }[]>`
      SELECT COUNT(*)::int AS "openPOs" FROM purchase_orders
      WHERE deleted_at IS NULL AND status IN ('Draft', 'Sent', 'Dispatched')`;
    const [{ dispatched }] = await tx.$queryRaw<{ dispatched: number }[]>`
      SELECT COUNT(*)::int AS dispatched FROM purchase_orders
      WHERE deleted_at IS NULL AND status = 'Dispatched'`;

    const purchaseSummary: PurchaseSummaryItem[] = [
      { title: "Pending PRs", value: pendingPRs, desc: "Awaiting manager approval" },
      { title: "Open POs", value: openPOs, desc: "Shipment agreements in transit" },
      { title: "Expected Deliveries", value: dispatched, desc: "Dispatched, awaiting goods-in" },
    ];

    // ── Recent production orders ──
    const orderRows = await tx.$queryRaw<{ orderId: string; product: string; qty: number; status: string }[]>`
      SELECT po.order_no AS "orderId", p.name AS product, po.qty::int AS qty, po.status::text AS status
      FROM production_orders po
      JOIN products p ON p.id = po.product_id
      WHERE po.deleted_at IS NULL AND po.status <> 'Cancelled'
      ORDER BY po.created_at DESC, po.order_no DESC
      LIMIT 5`;
    const recentProductionOrders: DashProductionOrder[] = orderRows.map((r) => ({
      orderId: r.orderId,
      product: r.product,
      qty: r.qty,
      status: dashOrderStatus(r.status),
    }));

    // ── Recent activity: unified feed of the latest business events + stock movements ──
    const activityRows = await tx.$queryRaw<{ text: string; ts: Date }[]>`
      SELECT text, ts FROM (
        SELECT 'Production order ' || po.order_no || ' (' || po.qty || ' units) — '
               || replace(po.status::text, '_', ' ') AS text, po.created_at AS ts
        FROM production_orders po WHERE po.deleted_at IS NULL
        UNION ALL
        SELECT 'Purchase order ' || po_no || ' ' || lower(status::text) AS text, created_at AS ts
        FROM purchase_orders WHERE deleted_at IS NULL
        UNION ALL
        SELECT 'Purchase request ' || pr_no || ' ' || replace(lower(status::text), '_', ' ') AS text, created_at AS ts
        FROM purchase_requests WHERE deleted_at IS NULL
        UNION ALL
        SELECT 'Stock ' || lower(it.type::text) || ' (' || (CASE WHEN it.qty_delta > 0 THEN '+' ELSE '' END) || it.qty_delta::text || ') — ' || c.name AS text, it.created_at AS ts
        FROM inventory_transactions it
        JOIN component_brand_variants v ON v.id = it.component_brand_variant_id
        JOIN components c ON c.id = v.component_id
      ) e
      ORDER BY ts DESC
      LIMIT 8`;
    const recentActivities: ActivityItem[] = activityRows.map((r) => ({
      text: r.text,
      time: relTime(r.ts),
    }));

    // ── Category distribution (for inventory category ratio chart) ──
    const categoryDistribution = await tx.$queryRaw<CategoryItem[]>`
      SELECT COALESCE(NULLIF(c.category, ''), 'General') AS name, COUNT(*)::int AS value
      FROM components c
      WHERE c.deleted_at IS NULL
      GROUP BY COALESCE(NULLIF(c.category, ''), 'General')
      ORDER BY value DESC
      LIMIT 6`;

    // ── Product build-readiness: buildable units = min over BOM of ⌊available ÷ per-unit⌋ ──
    const productStatus = await tx.$queryRaw<ProductStatusItem[]>`
      WITH demand AS (
        SELECT p.id AS product_id, p.name AS product_name,
               pl.component_id, SUM(pl.qty * pp.qty)::numeric AS per_unit
        FROM products p
        JOIN bom_versions bv ON bv.product_id = p.id AND bv.status = 'Active' AND bv.deleted_at IS NULL
        JOIN product_pcbs pp ON pp.bom_version_id = bv.id AND pp.deleted_at IS NULL
        JOIN pcb_revisions pr ON pr.id = pp.pcb_revision_id
        JOIN pcb_lines pl ON pl.pcb_revision_id = pr.id AND pl.deleted_at IS NULL
        WHERE p.deleted_at IS NULL
        GROUP BY p.id, p.name, pl.component_id
      ),
      avail AS (
        SELECT v.component_id, COALESCE(SUM(ib.available), 0)::numeric AS available
        FROM component_brand_variants v
        LEFT JOIN inventory_balances ib ON ib.component_brand_variant_id = v.id AND ib.deleted_at IS NULL
        WHERE v.deleted_at IS NULL
        GROUP BY v.component_id
      ),
      comp_build AS (
        SELECT d.product_id, d.product_name,
               COALESCE(MIN(FLOOR(COALESCE(a.available, 0) / NULLIF(d.per_unit, 0))), 0)::int AS "buildableQty"
        FROM demand d
        LEFT JOIN avail a ON a.component_id = d.component_id
        GROUP BY d.product_id, d.product_name
      )
      SELECT p.name AS product,
             COALESCE(cb."buildableQty", 0)::int AS "buildableQty",
             CASE
               WHEN cb.product_id IS NULL OR cb."buildableQty" = 0 THEN 'Blocked'
               WHEN cb."buildableQty" < 10 THEN 'Low Stock'
               ELSE 'Ready'
             END AS status
      FROM products p
      LEFT JOIN comp_build cb ON cb.product_id = p.id
      WHERE p.deleted_at IS NULL
      ORDER BY p.name`;

    // ── Low-stock components: on-hand below min or out of stock (Critical ≤ 50% of min or 0 stock) ──
    const lowStock = await tx.$queryRaw<LowStockItem[]>`
      SELECT c.name AS component, bal.on_hand::int AS current, c.min_stock::int AS minimum,
             CASE WHEN bal.on_hand = 0 OR bal.on_hand <= c.min_stock * 0.5 THEN 'Critical' ELSE 'Low' END AS status
      FROM components c
      JOIN LATERAL (
        SELECT COALESCE(SUM(ib.on_hand), 0) AS on_hand
        FROM component_brand_variants v
        LEFT JOIN inventory_balances ib ON ib.component_brand_variant_id = v.id AND ib.deleted_at IS NULL
        WHERE v.component_id = c.id AND v.deleted_at IS NULL
      ) bal ON TRUE
      WHERE c.deleted_at IS NULL AND (bal.on_hand < c.min_stock OR bal.on_hand = 0)
      ORDER BY bal.on_hand`;

    // ── Single-supplier risk: components with ≤ 1 distinct current supplier ──
    const singleSupplier = await tx.$queryRaw<SingleSupplierItem[]>`
      WITH offers AS (
        SELECT scp.component_id, COUNT(DISTINCT scp.supplier_id)::int AS n
        FROM supplier_component_prices scp
        WHERE scp.valid_to IS NULL AND scp.deleted_at IS NULL
        GROUP BY scp.component_id
      )
      SELECT c.name AS component,
             COALESCE((
               SELECT s.name FROM supplier_component_prices scp2
               JOIN suppliers s ON s.id = scp2.supplier_id
               WHERE scp2.component_id = c.id AND scp2.valid_to IS NULL AND scp2.deleted_at IS NULL
               ORDER BY scp2.price ASC LIMIT 1
             ), '—') AS supplier
      FROM components c
      LEFT JOIN offers o ON o.component_id = c.id
      WHERE c.deleted_at IS NULL AND COALESCE(o.n, 0) <= 1
      ORDER BY c.name
      LIMIT 6`;

    // ── Top-consumed (by annual consumption or active BOM demand) ──
    const consumedRows = await tx.$queryRaw<{ component: string; monthly: number }[]>`
      SELECT c.name AS component,
             GREATEST(
               ROUND(c.annual_consumption / 12.0)::int,
               COALESCE(SUM(pl.qty * COALESCE(pp.qty, 1) * 20), 0)::int
             ) AS monthly
      FROM components c
      LEFT JOIN pcb_lines pl ON pl.component_id = c.id AND pl.deleted_at IS NULL
      LEFT JOIN product_pcbs pp ON pp.pcb_revision_id = pl.pcb_revision_id AND pp.deleted_at IS NULL
      WHERE c.deleted_at IS NULL
      GROUP BY c.id, c.name, c.annual_consumption
      ORDER BY monthly DESC, c.name
      LIMIT 5`;
    const topConsumed: ConsumedComponent[] = consumedRows.map((r) => ({
      component: r.component,
      monthlyUsage: r.monthly.toLocaleString(),
    }));

    // ── Usage impact: components used across the most products (via Active BOMs) ──
    const usageImpact = await tx.$queryRaw<UsageImpactItem[]>`
      WITH usage AS (
        SELECT pl.component_id, COUNT(DISTINCT p.id)::int AS products
        FROM products p
        JOIN bom_versions bv ON bv.product_id = p.id AND bv.status = 'Active' AND bv.deleted_at IS NULL
        JOIN product_pcbs pp ON pp.bom_version_id = bv.id AND pp.deleted_at IS NULL
        JOIN pcb_revisions pr ON pr.id = pp.pcb_revision_id
        JOIN pcb_lines pl ON pl.pcb_revision_id = pr.id AND pl.deleted_at IS NULL
        WHERE p.deleted_at IS NULL
        GROUP BY pl.component_id
      )
      SELECT c.name AS component, u.products AS "usedInProducts"
      FROM usage u JOIN components c ON c.id = u.component_id
      ORDER BY u.products DESC, c.name LIMIT 3`;

    return {
      inventoryValue: value,
      productionBlockers: blockerRows,
      purchaseSummary,
      recentProductionOrders,
      recentActivities,
      categoryDistribution,
      productStatus,
      lowStock,
      singleSupplier,
      topConsumed,
      usageImpact,
    };
  });
}

