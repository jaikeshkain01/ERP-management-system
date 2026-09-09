/**
 * Per-item stats for the Assembled Products workspace (/products/list).
 *
 * Batches four cheap queries into one call so the module card grid can
 * badge each assembled item with:
 *   • Active BOM version + line count
 *   • Buildable qty (min across leaves of on_hand / per_unit_qty)
 *   • Open production orders
 *
 * The module owns this endpoint — it is not part of the shared /api/items
 * shape. Semi-assembled and universal items lists don't need the same
 * signals (different workflows), so keeping the stats endpoint scoped to
 * products keeps each module independent.
 */

import { Prisma } from "@/generated/prisma/client";
import { withTenant, type TxClient, type TenantContext } from "@/lib/prisma";
import { requireSession } from "@/lib/server/session";
import { assertPermission } from "@/lib/server/rbac";

async function guarded<T>(perm: string, fn: (tx: TxClient, ctx: TenantContext) => Promise<T>): Promise<T> {
  const ctx = await requireSession();
  return withTenant(ctx, async (tx) => {
    await assertPermission(tx, ctx, perm);
    return fn(tx, ctx);
  });
}

export interface AssembledProductStats {
  /** Item uuid — key. */
  itemId: string;
  /** Active BOM version label ("v3") or null when no Active BOM exists. */
  activeBomVersion: string | null;
  /** Rows in the Active BOM. 0 when no Active BOM. */
  bomLineCount: number;
  /** How many units are buildable with current on-hand stock. `null` when
   *  the item has no Active BOM (buildable is undefined then). */
  buildableQty: number | null;
  /** Draft + Ready + In_Progress production_orders keyed to this item. */
  openOrders: number;
  /** Σ (per_unit_qty × best_price) across leaves. Best-price is the
   *  cheapest lot unit_cost we've ever received for the leaf; falls back
   *  to cheapest supplier_component_prices row when no lot exists.
   *  `null` when no Active BOM. */
  unitCostRollup: number | null;
  /** Fraction of leaves (0-1) that had a known price. 1.0 = fully
   *  priced; anything below means the rollup is a lower bound. */
  costCoverage: number;
}

export async function getAssembledProductStats(): Promise<AssembledProductStats[]> {
  return guarded("item.view", async (tx, ctx) => {
    // 1) Active BOM per assembled item + line count in a single scan.
    const versions = await tx.$queryRaw<{
      itemId: string; bomVersionId: string; version: string; lineCount: number;
    }[]>`
      SELECT bv.parent_item_id AS "itemId",
             bv.id             AS "bomVersionId",
             bv.version        AS "version",
             (SELECT COUNT(*)::int
                FROM item_bom_lines bl
               WHERE bl.bom_version_id = bv.id AND bl.deleted_at IS NULL) AS "lineCount"
        FROM item_bom_versions bv
        JOIN items i ON i.id = bv.parent_item_id
       WHERE i.company_id = ${ctx.companyId!}::uuid
         AND i.deleted_at IS NULL
         AND i.item_type = 'finished_product'::item_type
         AND bv.status = 'Active'::bom_status
         AND bv.deleted_at IS NULL`;

    const versionIds = versions.map((v) => v.bomVersionId);
    // 2) Recursive explode: every parent × leaf pair with per-unit qty.
    //    Only leaves (children with no Active BOM below them) count for
    //    buildable-qty — internal nodes are just structure.
    const demand = versionIds.length === 0 ? [] : await tx.$queryRaw<{
      parentItemId: string; leafItemId: string; perUnit: number;
    }[]>(Prisma.sql`
      WITH RECURSIVE explode(parent_item_id, child, qty, depth) AS (
        SELECT bv.parent_item_id, bl.child_item_id, bl.qty::float8, 1
          FROM item_bom_versions bv
          JOIN item_bom_lines bl ON bl.bom_version_id = bv.id AND bl.deleted_at IS NULL
         WHERE bv.id IN (${Prisma.join(versionIds.map((id) => Prisma.sql`${id}::uuid`))})
        UNION ALL
        SELECT e.parent_item_id, bl.child_item_id, (e.qty * bl.qty)::float8, e.depth + 1
          FROM explode e
          JOIN item_bom_versions cbv ON cbv.parent_item_id = e.child
                                    AND cbv.status = 'Active'
                                    AND cbv.deleted_at IS NULL
          JOIN item_bom_lines bl ON bl.bom_version_id = cbv.id AND bl.deleted_at IS NULL
         WHERE e.depth < 20
      )
      SELECT e.parent_item_id  AS "parentItemId",
             e.child           AS "leafItemId",
             SUM(e.qty)::float8 AS "perUnit"
        FROM explode e
       WHERE NOT EXISTS (
         SELECT 1 FROM item_bom_versions bv2
          WHERE bv2.parent_item_id = e.child
            AND bv2.status = 'Active'
            AND bv2.deleted_at IS NULL
       )
       GROUP BY e.parent_item_id, e.child`);

    // 3) On-hand per leaf. One aggregate query for every leaf across every
    //    parent — the workload is bounded by the catalog size, not the
    //    product count.
    const leafIds = Array.from(new Set(demand.map((d) => d.leafItemId)));
    const stocks = leafIds.length === 0 ? [] : await tx.$queryRaw<{
      itemId: string; onHand: number;
    }[]>(Prisma.sql`
      SELECT v.item_id AS "itemId",
             COALESCE(SUM(ib.on_hand), 0)::float8 AS "onHand"
        FROM item_variants v
        LEFT JOIN inventory_balances ib
               ON ib.item_variant_id = v.id AND ib.deleted_at IS NULL
       WHERE v.item_id IN (${Prisma.join(leafIds.map((id) => Prisma.sql`${id}::uuid`))})
         AND v.deleted_at IS NULL
       GROUP BY v.item_id`);
    const stockByLeaf = new Map(stocks.map((s) => [s.itemId, s.onHand]));

    // 3b) Best price per leaf. Prefer the cheapest lot unit_cost we've ever
    //     received (that's real, tenant-specific), fall back to the cheapest
    //     current supplier_component_prices row (F2 mirror lets us join
    //     scp.component_id → items.id). One SQL, one row per leaf.
    const prices = leafIds.length === 0 ? [] : await tx.$queryRaw<{
      itemId: string; price: number | null;
    }[]>(Prisma.sql`
      SELECT i.id AS "itemId",
             LEAST(
               (SELECT MIN(il.unit_cost)::float8
                  FROM item_lots il
                  JOIN item_variants iv ON iv.id = il.item_variant_id
                 WHERE iv.item_id = i.id
                   AND il.unit_cost IS NOT NULL
                   AND il.deleted_at IS NULL),
               (SELECT MIN(scp.price)::float8
                  FROM supplier_component_prices scp
                 WHERE scp.component_id = i.id
                   AND scp.valid_to IS NULL
                   AND scp.deleted_at IS NULL)
             ) AS price
        FROM items i
       WHERE i.id IN (${Prisma.join(leafIds.map((id) => Prisma.sql`${id}::uuid`))})
         AND i.deleted_at IS NULL`);
    const priceByLeaf = new Map<string, number | null>();
    for (const p of prices) priceByLeaf.set(p.itemId, p.price);

    // 4) Open production orders per assembled item. The enum literal
    //    is 'In Progress' (with a space) — 'In_Progress' is a common
    //    mistranscription and Postgres rejects it as an invalid input.
    const orders = await tx.$queryRaw<{ itemId: string; openCount: number }[]>`
      SELECT product_id       AS "itemId",
             COUNT(*)::int    AS "openCount"
        FROM production_orders
       WHERE company_id = ${ctx.companyId!}::uuid
         AND deleted_at IS NULL
         AND status IN ('Draft'::prod_order_status, 'Ready'::prod_order_status, 'In Progress'::prod_order_status)
       GROUP BY product_id`;

    // Fold demand into per-parent buildable qty (min across leaves).
    const demandByParent = new Map<string, { leafItemId: string; perUnit: number }[]>();
    for (const d of demand) {
      const arr = demandByParent.get(d.parentItemId) ?? [];
      arr.push({ leafItemId: d.leafItemId, perUnit: d.perUnit });
      demandByParent.set(d.parentItemId, arr);
    }
    const openByItem = new Map<string, number>();
    for (const o of orders) openByItem.set(o.itemId, o.openCount);

    // Emit a row for every item with an Active BOM. Items without one are
    // not returned; the client treats "missing" as "no Active BOM yet".
    return versions.map<AssembledProductStats>((v) => {
      const leaves = demandByParent.get(v.itemId) ?? [];
      let buildable = leaves.length === 0 ? 0 : Infinity;
      let costRollup = 0;
      let priced = 0;
      for (const l of leaves) {
        const stock = stockByLeaf.get(l.leafItemId) ?? 0;
        const bp = l.perUnit > 0 ? Math.floor(stock / l.perUnit) : Infinity;
        if (bp < buildable) buildable = bp;
        const price = priceByLeaf.get(l.leafItemId);
        if (price != null && Number.isFinite(price)) {
          costRollup += l.perUnit * price;
          priced++;
        }
      }
      return {
        itemId: v.itemId,
        activeBomVersion: v.version,
        bomLineCount: v.lineCount,
        buildableQty: buildable === Infinity ? 0 : buildable,
        openOrders: openByItem.get(v.itemId) ?? 0,
        unitCostRollup: leaves.length === 0 ? 0 : costRollup,
        costCoverage: leaves.length === 0 ? 1 : priced / leaves.length,
      };
    });
  });
}
