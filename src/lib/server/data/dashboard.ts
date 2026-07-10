/**
 * Dashboard aggregates (mock/DB). Cross-module overview numbers that are NOT
 * derivable from the catalog bootstrap alone (inventory valuation, production
 * shortages, purchasing pipeline counts, recent activity). Catalog-derived
 * panels (product status, low stock, single-supplier, top-consumed, usage,
 * distribution) are still built client-side from /api/bootstrap via
 * buildDashboardData() — this endpoint only fills the operational gaps.
 *
 * Mock mode returns the static panels from src/mockdata/dashboard.
 */
import { isTesting } from "@/lib/config";
import { withTenant, type TenantContext, type TxClient } from "@/lib/prisma";
import { requireSession } from "@/lib/server/session";
import { assertPermission } from "@/lib/server/rbac";
import { COMPONENTS } from "@/mockdata";
import {
  PRODUCTION_BLOCKERS,
  PRODUCTION_ORDERS_RECENT,
  PURCHASE_SUMMARY,
  RECENT_ACTIVITIES,
  type BlockerItem,
  type DashProductionOrder,
  type ActivityItem,
} from "@/mockdata/dashboard";

export interface PurchaseSummaryItem {
  title: string;
  value: number;
  desc: string;
}

export interface DashboardSummary {
  inventoryValue: number;
  productionBlockers: BlockerItem[];
  purchaseSummary: PurchaseSummaryItem[];
  recentProductionOrders: DashProductionOrder[];
  recentActivities: ActivityItem[];
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

/** Mock-mode inventory valuation: Σ stock × cheapest offer price across the seed catalog. */
function mockInventoryValue(): number {
  return COMPONENTS.reduce((sum, c) => {
    const best = c.offers.length ? Math.min(...c.offers.map((o) => o.price)) : 0;
    return sum + c.stock * best;
  }, 0);
}

export async function getDashboard(): Promise<DashboardSummary> {
  if (isTesting) {
    return {
      inventoryValue: mockInventoryValue(),
      productionBlockers: PRODUCTION_BLOCKERS,
      purchaseSummary: PURCHASE_SUMMARY,
      recentProductionOrders: PRODUCTION_ORDERS_RECENT,
      recentActivities: RECENT_ACTIVITIES,
    };
  }

  return guarded("component.view", async (tx) => {
    // ── Inventory valuation: on_hand × cheapest current price for the variant's part ──
    const [{ value }] = await tx.$queryRaw<{ value: number }[]>`
      SELECT COALESCE(SUM(ib.on_hand * COALESCE(price.p, 0)), 0)::float8 AS value
      FROM inventory_balances ib
      JOIN component_brand_variants v ON v.id = ib.component_brand_variant_id
      LEFT JOIN LATERAL (
        SELECT MIN(scp.price) AS p
        FROM supplier_component_prices scp
        WHERE scp.component_id = v.component_id AND scp.brand_id = v.brand_id
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

    // ── Recent activity: unified feed of the latest business events ──
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
      ) e
      ORDER BY ts DESC
      LIMIT 6`;
    const recentActivities: ActivityItem[] = activityRows.map((r) => ({
      text: r.text,
      time: relTime(r.ts),
    }));

    return {
      inventoryValue: value,
      productionBlockers: blockerRows,
      purchaseSummary,
      recentProductionOrders,
      recentActivities,
    };
  });
}
