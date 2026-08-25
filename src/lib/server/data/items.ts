/**
 * Items (Postgres) — the UNIVERSAL item master introduced by F1 of the universal-item
 * transformation (see memory/project_universal_item.md). Every "thing" the company
 * holds — raw material, sub-assembly, finished good, consumable, asset, packaging —
 * is a row here, differentiated by `item_type`.
 *
 * Accessed via raw SQL because `items` / `item_variants` are post-baseline tables
 * not present in the generated Prisma client (same convention as item_categories
 * and item_lots).
 *
 * F1 SCOPE (this file at feature time):
 *   • List / get one / create item + its variants.
 *   • NO linkage to the ledger, BOM, purchase, or production. Those wire up in
 *     F3+ once the backfill (F2) is done.
 *
 * F5.1 ADDED:
 *   • updateItem — PATCH covering every column on `items` PLUS dual-write to
 *     the underlying `components` row when the item was backfilled from it.
 *     Product- and PCB-revision-backed items intentionally reject writes at
 *     this slice (their legacy tables have no update path yet); F5.6 wires them.
 *   • deleteItem — soft delete on `items` + its `item_variants` + the legacy
 *     `components` row. Guarded on positive on-hand and BOM usage.
 *
 * ADD-FORM P3 ADDED:
 *   • addItemVariant — attach a purchased brand variant (brand + MPN) to an
 *     item. Brand is resolved by name (created if new). Opening stock is
 *     deliberately NOT supported here yet — the ledger's F3 invariant
 *     (component_brand_variant_id NOT NULL) blocks pure-universal items from
 *     holding stock rows. F5.3 + F5.4 will remove that limit; this function
 *     will gain an openingLocationId / stock argument then.
 *
 * DETAILS P14 ADDED:
 *   • getItemPcbUsage — which PCBs' BOM lines reference this item. Works
 *     against the legacy `pcb_lines.component_id` column, so it lights up
 *     only for component-backed items (raw / consumable / asset / packaging).
 *     Product / PCB-revision items return an empty list.
 *
 * Permissions: F5.2 introduced a dedicated `item.*` resource. Every role that
 * previously had `component.*` was mirrored to `item.*` at migration time, so
 * the switch is non-breaking for existing tenants. `item_categories.ts` still
 * guards on `component.*` because categories are shared with the legacy path;
 * they get their own perm resource when the legacy /components/* endpoints
 * finally get retired.
 */
import { Prisma } from "@/generated/prisma/client";
import { withTenant, type TenantContext, type TxClient } from "@/lib/prisma";
import { Errors } from "@/lib/server/http";
import { assertPermission } from "@/lib/server/rbac";
import { requireSession } from "@/lib/server/session";
import { isUuid } from "@/lib/server/data/util";
import { resolveOrCreateBrand } from "@/lib/server/data/components";

// ── shapes ───────────────────────────────────────────────────────────────────

/** How a variant is sourced. Purchased variants carry a brand+part_no; the
 *  manufactured variant is singular per item and has no brand. */
export type ItemVariantSource = "purchased" | "manufactured";
export type ItemType =
  | "raw"
  | "semi_assembled"
  | "assembled"
  | "consumable"
  | "asset"
  | "packaging";
export type ItemStatus = "active" | "inactive" | "discontinued";

const ITEM_TYPES = new Set<ItemType>([
  "raw",
  "semi_assembled",
  "assembled",
  "consumable",
  "asset",
  "packaging",
]);
const ITEM_STATUSES = new Set<ItemStatus>(["active", "inactive", "discontinued"]);

export interface ItemVariantView {
  id: string;
  itemId: string;
  sourceKind: ItemVariantSource;
  brandId: string | null;
  brandSlug: string | null;
  partNo: string | null;
  isDefault: boolean;
  status: ItemStatus;
}

export type SolderType = "SMD" | "DIP";
export type MslLevel = "1" | "2" | "2a" | "3" | "4" | "5" | "5a" | "6";
const MSL_LEVELS = new Set<MslLevel>(["1", "2", "2a", "3", "4", "5", "5a", "6"]);

export type ItemCondition       = "new" | "good" | "fair" | "poor" | "retired";
export type ItemDepreciationKind = "none" | "straight_line" | "reducing_balance";
const ITEM_CONDITIONS       = new Set<ItemCondition>(["new", "good", "fair", "poor", "retired"]);
const ITEM_DEPRECIATION_KIND = new Set<ItemDepreciationKind>(["none", "straight_line", "reducing_balance"]);

export interface ItemView {
  id: string;
  code: string;
  /** Industry-standard part number, distinct from the internal `code` SKU.
   *  Optional — an item is valid without one as long as it has an MPN via a
   *  purchased variant. */
  genericPn: string | null;
  /** Board metadata (add-form P5). Nullable — only meaningful for `raw` and
   *  `semi_assembled` items; other types leave these unset. */
  solderType: SolderType | null;
  footprint: string | null;
  spq: number | null;
  /** Packaging metadata (add-form P6). All optional; the UI groups them into
   *  one section so callers set them together or not at all. */
  packageLengthMm: number | null;
  packageWidthMm: number | null;
  packageHeightMm: number | null;
  packageWeightG: number | null;
  tareWeightG: number | null;
  packageMaterial: string | null;
  packageReusable: boolean | null;
  /** Storage / MSL metadata (add-form P7). */
  storageTempMinC: number | null;
  storageTempMaxC: number | null;
  storageHumidityMinPct: number | null;
  storageHumidityMaxPct: number | null;
  mslLevel: MslLevel | null;
  hazardous: boolean | null;
  expiryTracked: boolean | null;
  /** Asset-register metadata (add-form P8). */
  custodianUserId: string | null;
  custodianName: string | null;
  serialNumber: string | null;
  purchaseDate: string | null;   // ISO date string yyyy-mm-dd
  purchaseCost: number | null;
  warrantyMonths: number | null;
  usefulLifeMonths: number | null;
  salvageValue: number | null;
  depreciationMethod: ItemDepreciationKind | null;
  conditionKind: ItemCondition | null;
  name: string;
  description: string | null;
  categoryId: string | null;
  categoryPath: string | null;
  itemType: ItemType;
  baseUom: string;
  minStock: number;
  reorderQty: number;
  safetyStock: number;
  leadTimeDays: number | null;
  specs: unknown;
  status: ItemStatus;
  /** Sellable flag (Slice 3). Independent of stage — a Populated PCB may be
   *  `semi_assembled` AND a finished good. Feeds the future sales module. */
  isFinishedGood: boolean;
  /** Inventory rollup (F5.5). Sum across every variant + location.
   *  0 when the item holds no stock. */
  onHand: number;
  /** On-hand valuation (Σ lot on-hand × unit_cost). 0 when no cost captured. */
  stockValue: number;
  /** Timestamp of the most recent ledger row for this item (any variant).
   *  Null when there has never been a movement. ISO string. */
  lastMovementAt: string | null;
  variants: ItemVariantView[];
}

export interface ItemFilters {
  /** Substring match against code or name (case-insensitive, uses trigram index on name). */
  q?: string;
  itemType?: ItemType;
  status?: ItemStatus;
  categoryId?: string;
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function guarded<T>(
  perm: string,
  fn: (tx: TxClient, ctx: TenantContext) => Promise<T>,
): Promise<T> {
  const ctx = await requireSession();
  return withTenant(ctx, async (tx) => {
    await assertPermission(tx, ctx, perm);
    return fn(tx, ctx);
  });
}

/** Column list used by every SELECT that returns an Item view (minus variants,
 *  which are joined separately). category path is looked up per row. */
const ITEM_SELECT = Prisma.sql`
  i.id, i.code, i.generic_pn AS "genericPn",
  i.solder_type::text AS "solderType", i.footprint, i.spq,
  i.package_length_mm::float8 AS "packageLengthMm",
  i.package_width_mm::float8  AS "packageWidthMm",
  i.package_height_mm::float8 AS "packageHeightMm",
  i.package_weight_g::float8  AS "packageWeightG",
  i.tare_weight_g::float8     AS "tareWeightG",
  i.package_material AS "packageMaterial",
  i.package_reusable AS "packageReusable",
  i.storage_temp_min_c::float8       AS "storageTempMinC",
  i.storage_temp_max_c::float8       AS "storageTempMaxC",
  i.storage_humidity_min_pct::float8 AS "storageHumidityMinPct",
  i.storage_humidity_max_pct::float8 AS "storageHumidityMaxPct",
  i.msl_level     AS "mslLevel",
  i.hazardous     AS "hazardous",
  i.expiry_tracked AS "expiryTracked",
  i.custodian_user_id AS "custodianUserId",
  (SELECT u.name FROM users u WHERE u.id = i.custodian_user_id) AS "custodianName",
  i.serial_number    AS "serialNumber",
  to_char(i.purchase_date, 'YYYY-MM-DD') AS "purchaseDate",
  i.purchase_cost::float8      AS "purchaseCost",
  i.warranty_months            AS "warrantyMonths",
  i.useful_life_months         AS "usefulLifeMonths",
  i.salvage_value::float8      AS "salvageValue",
  i.depreciation_method::text  AS "depreciationMethod",
  i.condition_kind::text       AS "conditionKind",
  i.name, i.description,
  i.category_id AS "categoryId",
  (SELECT ic.path FROM item_categories ic WHERE ic.id = i.category_id) AS "categoryPath",
  i.item_type::text AS "itemType",
  i.base_uom AS "baseUom",
  i.min_stock::float8 AS "minStock",
  i.reorder_qty::float8 AS "reorderQty",
  i.safety_stock::float8 AS "safetyStock",
  i.lead_time_days AS "leadTimeDays",
  i.specs,
  i.status::text AS "status",
  i.is_finished_good AS "isFinishedGood"
`;

interface ItemRow {
  id: string;
  code: string;
  genericPn: string | null;
  solderType: SolderType | null;
  footprint: string | null;
  spq: number | null;
  packageLengthMm: number | null;
  packageWidthMm: number | null;
  packageHeightMm: number | null;
  packageWeightG: number | null;
  tareWeightG: number | null;
  packageMaterial: string | null;
  packageReusable: boolean | null;
  storageTempMinC: number | null;
  storageTempMaxC: number | null;
  storageHumidityMinPct: number | null;
  storageHumidityMaxPct: number | null;
  mslLevel: MslLevel | null;
  hazardous: boolean | null;
  expiryTracked: boolean | null;
  custodianUserId: string | null;
  custodianName: string | null;
  serialNumber: string | null;
  purchaseDate: string | null;
  purchaseCost: number | null;
  warrantyMonths: number | null;
  usefulLifeMonths: number | null;
  salvageValue: number | null;
  depreciationMethod: ItemDepreciationKind | null;
  conditionKind: ItemCondition | null;
  name: string;
  description: string | null;
  categoryId: string | null;
  categoryPath: string | null;
  itemType: ItemType;
  baseUom: string;
  minStock: number;
  reorderQty: number;
  safetyStock: number;
  leadTimeDays: number | null;
  specs: unknown;
  status: ItemStatus;
  isFinishedGood: boolean;
}

interface VariantRow extends ItemVariantView {}

interface RollupRow { itemId: string; onHand: number; stockValue: number; lastMovementAt: string | null }

/** Batch inventory rollup for a set of items. Sums `on_hand` across every
 *  variant × location, derives on-hand valuation from lot unit-costs, and reads
 *  the most recent ledger `created_at` per item. One round-trip for on-hand +
 *  a batched lot-value aggregate. */
async function fetchRollups(tx: TxClient, itemIds: string[]): Promise<Map<string, RollupRow>> {
  const byItem = new Map<string, RollupRow>();
  if (itemIds.length === 0) return byItem;
  const idList = Prisma.join(itemIds.map((id) => Prisma.sql`${id}::uuid`));
  const rows = await tx.$queryRaw<RollupRow[]>(Prisma.sql`
    SELECT v.item_id AS "itemId",
      COALESCE(SUM(ib.on_hand), 0)::float8 AS "onHand",
      -- On-hand valuation: per lot (derived on-hand × unit_cost), summed per item.
      COALESCE((
        SELECT SUM(lot_val.qty * COALESCE(lot_val.unit_cost, 0))
        FROM (
          SELECT il.id, il.unit_cost, SUM(t.qty_delta) AS qty
          FROM item_lots il
          JOIN inventory_transactions t ON t.lot_id = il.id
          JOIN item_variants vv ON vv.id = il.item_variant_id
          WHERE vv.item_id = v.item_id AND il.deleted_at IS NULL
          GROUP BY il.id, il.unit_cost
        ) lot_val
      ), 0)::float8 AS "stockValue",
      (SELECT to_char(MAX(t.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
         FROM inventory_transactions t
         JOIN item_variants v2 ON v2.id = t.item_variant_id
         WHERE v2.item_id = v.item_id
      ) AS "lastMovementAt"
    FROM item_variants v
    LEFT JOIN inventory_balances ib ON ib.item_variant_id = v.id AND ib.deleted_at IS NULL
    WHERE v.deleted_at IS NULL
      AND v.item_id IN (${idList})
    GROUP BY v.item_id
  `);
  for (const r of rows) byItem.set(r.itemId, r);
  return byItem;
}

async function fetchVariants(tx: TxClient, itemIds: string[]): Promise<Map<string, ItemVariantView[]>> {
  const byItem = new Map<string, ItemVariantView[]>();
  if (itemIds.length === 0) return byItem;
  const rows = await tx.$queryRaw<VariantRow[]>(Prisma.sql`
    SELECT v.id, v.item_id AS "itemId",
      v.source_kind::text AS "sourceKind",
      v.brand_id AS "brandId",
      b.slug AS "brandSlug",
      v.part_no AS "partNo",
      v.is_default AS "isDefault",
      v.status::text AS "status"
    FROM item_variants v
    LEFT JOIN brands b ON b.id = v.brand_id
    WHERE v.deleted_at IS NULL
      AND v.item_id IN (${Prisma.join(itemIds.map((id) => Prisma.sql`${id}::uuid`))})
    ORDER BY v.is_default DESC, v.source_kind, b.slug NULLS FIRST, v.part_no NULLS LAST
  `);
  for (const r of rows) {
    const list = byItem.get(r.itemId) ?? [];
    list.push(r);
    byItem.set(r.itemId, list);
  }
  return byItem;
}

function toView(row: ItemRow, variants: ItemVariantView[], rollup: RollupRow | undefined): ItemView {
  return {
    ...row, variants,
    onHand: rollup?.onHand ?? 0,
    stockValue: rollup?.stockValue ?? 0,
    lastMovementAt: rollup?.lastMovementAt ?? null,
  };
}

// ── list ─────────────────────────────────────────────────────────────────────

export async function listItems(filters: ItemFilters = {}): Promise<ItemView[]> {
  return guarded("item.view", async (tx) => {
    const where: Prisma.Sql[] = [Prisma.sql`i.deleted_at IS NULL`];
    if (filters.itemType) {
      if (!ITEM_TYPES.has(filters.itemType)) throw Errors.badRequest("Invalid itemType");
      where.push(Prisma.sql`i.item_type = ${filters.itemType}::item_type`);
    }
    if (filters.status) {
      if (!ITEM_STATUSES.has(filters.status)) throw Errors.badRequest("Invalid status");
      where.push(Prisma.sql`i.status = ${filters.status}::item_status`);
    }
    if (filters.categoryId) {
      if (!isUuid(filters.categoryId)) throw Errors.badRequest("Invalid categoryId");
      where.push(Prisma.sql`i.category_id = ${filters.categoryId}::uuid`);
    }
    if (filters.q?.trim()) {
      const q = `%${filters.q.trim()}%`;
      where.push(Prisma.sql`(i.code ILIKE ${q} OR i.name ILIKE ${q})`);
    }

    const rows = await tx.$queryRaw<ItemRow[]>(Prisma.sql`
      SELECT ${ITEM_SELECT}
      FROM items i
      WHERE ${Prisma.join(where, " AND ")}
      ORDER BY i.name ASC
    `);

    const ids = rows.map((r) => r.id);
    const [variants, rollups] = await Promise.all([fetchVariants(tx, ids), fetchRollups(tx, ids)]);
    return rows.map((r) => toView(r, variants.get(r.id) ?? [], rollups.get(r.id)));
  });
}

// ── get one ──────────────────────────────────────────────────────────────────

// ── PCB usage (details P14) ──────────────────────────────────────────────────

export interface ItemPcbUsageRow {
  pcbId: string;
  pcbSlug: string;
  pcbName: string;
  pcbRevisionId: string;
  rev: string;
  revisionStatus: string;
  qty: number;
  refDes: string | null;
}

/** For a given item, list every live PCB revision whose BOM references it.
 *  Rows are sorted by pcb → revision so multiple revisions of the same PCB
 *  cluster. Non-component-backed items return an empty array. */
export async function getItemPcbUsage(itemId: string): Promise<ItemPcbUsageRow[]> {
  return guarded("item.view", async (tx) => {
    if (!isUuid(itemId)) throw Errors.badRequest("Invalid item id");
    return tx.$queryRaw<ItemPcbUsageRow[]>`
      SELECT
        p.id                    AS "pcbId",
        p.slug                  AS "pcbSlug",
        p.name                  AS "pcbName",
        pr.id                   AS "pcbRevisionId",
        pr.rev                  AS "rev",
        pr.status::text         AS "revisionStatus",
        pl.qty::float8          AS "qty",
        pl.ref_des              AS "refDes"
      FROM pcb_lines pl
      JOIN pcb_revisions pr ON pr.id = pl.pcb_revision_id AND pr.deleted_at IS NULL
      JOIN pcbs         p  ON p.id  = pr.pcb_id           AND p.deleted_at  IS NULL
      WHERE pl.component_id = ${itemId}::uuid
        AND pl.deleted_at IS NULL
      ORDER BY p.name ASC, pr.rev ASC
    `;
  });
}

/** Load one item on the caller's tx — used by createItem/updateItem which
 *  need to return the ItemView from WITHIN their own transaction. A separate
 *  guarded() call from those sites would open a fresh tx that could not see
 *  the uncommitted INSERT/UPDATE. */
async function getItemInTx(tx: TxClient, id: string): Promise<ItemView> {
  if (!isUuid(id)) throw Errors.notFound("Item");
  const rows = await tx.$queryRaw<ItemRow[]>(Prisma.sql`
    SELECT ${ITEM_SELECT}
    FROM items i
    WHERE i.id = ${id}::uuid AND i.deleted_at IS NULL
  `);
  if (!rows[0]) throw Errors.notFound("Item");
  const [variants, rollups] = await Promise.all([
    fetchVariants(tx, [rows[0].id]),
    fetchRollups(tx, [rows[0].id]),
  ]);
  return toView(rows[0], variants.get(rows[0].id) ?? [], rollups.get(rows[0].id));
}

export async function getItem(id: string): Promise<ItemView> {
  return guarded("item.view", (tx) => getItemInTx(tx, id));
}

// ── stock rollup (F5.5) ─────────────────────────────────────────────────────

/** Universal stock rollup — mirrors ComponentStockView but keys on
 *  `item_variant_id` so manufactured items (products, PCB revisions, any
 *  pure-universal item without a CBV) resolve too. Powers `/items/details/[id]`. */
export interface ItemStockView {
  itemId: string;
  code: string;
  onHand: number;
  reserved: number;
  available: number;
  damaged: number;
  byWarehouse: { warehouseId: string; code: string; onHand: number }[];
  byVariant:   { variantId: string; sourceKind: ItemVariantSource; brandSlug: string | null; partNo: string | null; onHand: number; available: number }[];
  byLot:       {
    lotNo: string; partNo: string | null; brandSlug: string | null;
    supplierName: string | null; receivedDate: string | null;
    expiryDate: string | null; unitCost: number | null; onHand: number; value: number;
  }[];
}

export async function getItemStock(id: string): Promise<ItemStockView> {
  return guarded("inventory.view", async (tx) => {
    if (!isUuid(id)) throw Errors.notFound("Item");
    const item = await tx.$queryRaw<{ id: string; code: string }[]>`
      SELECT id, code FROM items WHERE id = ${id}::uuid AND deleted_at IS NULL`;
    if (!item[0]) throw Errors.notFound("Item");

    const [tot] = await tx.$queryRaw<{ onHand: number; reserved: number; available: number; damaged: number }[]>`
      SELECT COALESCE(SUM(ib.on_hand),   0)::float8 AS "onHand",
             COALESCE(SUM(ib.reserved),  0)::float8 AS "reserved",
             COALESCE(SUM(ib.available), 0)::float8 AS "available",
             COALESCE(SUM(ib.damaged),   0)::float8 AS "damaged"
      FROM inventory_balances ib
      JOIN item_variants v ON v.id = ib.item_variant_id
      WHERE v.item_id = ${id}::uuid AND ib.deleted_at IS NULL`;

    const byWarehouse = await tx.$queryRaw<ItemStockView["byWarehouse"]>`
      SELECT ib.warehouse_id AS "warehouseId", w.code, SUM(ib.on_hand)::float8 AS "onHand"
      FROM inventory_balances ib
      JOIN item_variants v ON v.id = ib.item_variant_id
      JOIN warehouses w ON w.id = ib.warehouse_id
      WHERE v.item_id = ${id}::uuid AND ib.deleted_at IS NULL
      GROUP BY ib.warehouse_id, w.code ORDER BY w.code`;

    const byVariant = await tx.$queryRaw<ItemStockView["byVariant"]>`
      SELECT v.id AS "variantId",
             v.source_kind::text AS "sourceKind",
             b.slug AS "brandSlug",
             v.part_no AS "partNo",
             COALESCE(SUM(ib.on_hand),   0)::float8 AS "onHand",
             COALESCE(SUM(ib.available), 0)::float8 AS "available"
      FROM item_variants v
      LEFT JOIN brands b ON b.id = v.brand_id
      LEFT JOIN inventory_balances ib ON ib.item_variant_id = v.id AND ib.deleted_at IS NULL
      WHERE v.item_id = ${id}::uuid AND v.deleted_at IS NULL
      GROUP BY v.id, v.source_kind, b.slug, v.part_no
      ORDER BY v.is_default DESC, v.source_kind, b.slug NULLS FIRST, v.part_no NULLS LAST`;

    // Per-lot on-hand + value, from the ledger (FEFO order). Value uses the lot's
    // unit_cost. Enriched (F5.7+) with manufacturer (variant brand), supplier, and
    // arrival date (earliest inbound movement, else the lot's creation time).
    const byLot = await tx.$queryRaw<ItemStockView["byLot"]>`
      SELECT il.lot_no AS "lotNo",
             v.part_no AS "partNo",
             b.slug   AS "brandSlug",
             sup.name AS "supplierName",
             to_char(
               COALESCE(MIN(t.created_at) FILTER (WHERE t.qty_delta > 0), il.created_at) AT TIME ZONE 'UTC',
               'YYYY-MM-DD'
             ) AS "receivedDate",
             il.expiry_date::text AS "expiryDate",
             il.unit_cost::float8 AS "unitCost",
             SUM(t.qty_delta)::float8 AS "onHand",
             (SUM(t.qty_delta) * COALESCE(il.unit_cost, 0))::float8 AS "value"
      FROM item_lots il
      JOIN inventory_transactions t ON t.lot_id = il.id
      JOIN item_variants v ON v.id = il.item_variant_id
      LEFT JOIN brands b ON b.id = v.brand_id
      LEFT JOIN suppliers sup ON sup.id = il.supplier_id
      WHERE v.item_id = ${id}::uuid AND il.deleted_at IS NULL
      GROUP BY il.id, il.lot_no, v.part_no, b.slug, sup.name, il.expiry_date, il.unit_cost, il.created_at
      HAVING SUM(t.qty_delta) <> 0
      ORDER BY il.expiry_date NULLS LAST, il.lot_no`;

    return { itemId: item[0].id, code: item[0].code, ...tot, byWarehouse, byVariant, byLot };
  });
}

// ── variant lots at a location (F5.9 — Stock Out lot picker) ────────────────

export interface VariantLotOption {
  id: string;
  lotNo: string;
  expiryDate: string | null;
  onHand: number;            // derived on-hand (at the location if one is given, else total)
}

/** Lots of a given item_variant that still have positive on-hand — FEFO order.
 *  When `locationId` is supplied, on-hand is derived at THAT location only, so
 *  the Stock Out picker offers only lots that can actually be consumed from the
 *  chosen source. Keyed on item_variant_id → works for universal items. */
export async function getVariantLots(itemVariantId: string, locationId?: string): Promise<VariantLotOption[]> {
  return guarded("inventory.view", async (tx) => {
    if (!isUuid(itemVariantId)) throw Errors.badRequest("Invalid variantId");
    if (locationId && !isUuid(locationId)) throw Errors.badRequest("Invalid locationId");
    const locFilter = locationId
      ? Prisma.sql`FILTER (WHERE t.location_id = ${locationId}::uuid)`
      : Prisma.empty;
    return tx.$queryRaw<VariantLotOption[]>(Prisma.sql`
      SELECT il.id,
             il.lot_no AS "lotNo",
             il.expiry_date::text AS "expiryDate",
             COALESCE(SUM(t.qty_delta) ${locFilter}, 0)::float8 AS "onHand"
      FROM item_lots il
      JOIN inventory_transactions t ON t.lot_id = il.id
      WHERE il.item_variant_id = ${itemVariantId}::uuid AND il.deleted_at IS NULL
      GROUP BY il.id, il.lot_no, il.expiry_date
      HAVING COALESCE(SUM(t.qty_delta) ${locFilter}, 0) > 0
      ORDER BY il.expiry_date NULLS LAST, il.lot_no
    `);
  });
}

// ── movement history (F5.7+) ────────────────────────────────────────────────

export interface ItemLedgerRow {
  id: string;
  type: string;               // inventory_txn_type
  qtyDelta: number;
  variantId: string;
  brandSlug: string | null;
  partNo: string | null;
  warehouseCode: string | null;
  locationCode: string | null;
  lotNo: string | null;
  supplierName: string | null;
  refType: string | null;
  reason: string | null;
  createdAt: string;          // ISO
}

/** Recent inventory movements for an item, across all its variants — powers the
 *  "Movement history" section on the item detail page. Newest first. */
export async function getItemLedger(id: string, limit = 100): Promise<ItemLedgerRow[]> {
  return guarded("inventory.view", async (tx) => {
    if (!isUuid(id)) throw Errors.notFound("Item");
    const capped = Math.min(Math.max(limit, 1), 500);
    return tx.$queryRaw<ItemLedgerRow[]>`
      SELECT t.id,
             t.type::text AS "type",
             t.qty_delta::float8 AS "qtyDelta",
             t.item_variant_id AS "variantId",
             b.slug AS "brandSlug",
             v.part_no AS "partNo",
             w.code  AS "warehouseCode",
             sl.code AS "locationCode",
             il.lot_no AS "lotNo",
             sup.name  AS "supplierName",
             t.ref_type AS "refType",
             t.reason   AS "reason",
             to_char(t.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "createdAt"
      FROM inventory_transactions t
      JOIN item_variants v ON v.id = t.item_variant_id
      LEFT JOIN brands b ON b.id = v.brand_id
      LEFT JOIN warehouses w ON w.id = t.warehouse_id
      LEFT JOIN storage_locations sl ON sl.id = t.location_id
      LEFT JOIN item_lots il ON il.id = t.lot_id
      LEFT JOIN suppliers sup ON sup.id = il.supplier_id
      WHERE v.item_id = ${id}::uuid
      ORDER BY t.created_at DESC
      LIMIT ${capped}`;
  });
}

// ── BOM read (F6.3) ─────────────────────────────────────────────────────────

/** One BOM version summary for the version picker. */
export interface ItemBomVersionSummary {
  id: string;
  version: string;
  status: string;            // bom_status text
  effectiveFrom: string | null;
  effectiveTo: string | null;
  lineCount: number;
}

/** One resolved BOM line — the child item plus its qty and board metadata.
 *  `childHasBom` flags whether the child itself carries a BOM (i.e. is a
 *  sub-assembly that can be expanded further). */
export interface ItemBomLineView {
  id: string;
  childItemId: string;
  childCode: string;
  childName: string;
  childItemType: ItemType;
  qty: number;
  refDes: string | null;
  preferredBrandSlug: string | null;
  sequence: number | null;
  remarks: string | null;
  childHasBom: boolean;
}

export interface ItemBomView {
  itemId: string;
  versions: ItemBomVersionSummary[];
  /** The version whose lines are returned — the Active one if present, else the
   *  most recently created. Null when the item has no BOM at all. */
  selectedVersionId: string | null;
  lines: ItemBomLineView[];
}

/** Fetch an item's BOM (universal tables from F6). Returns every version for
 *  the picker plus the resolved lines of the selected version (Active, else
 *  latest, else the caller-named `versionId`). Empty `versions` for items with
 *  no BOM — the caller decides whether to render the section. */
export async function getItemBom(id: string, versionId?: string): Promise<ItemBomView> {
  return guarded("item.view", async (tx) => {
    if (!isUuid(id)) throw Errors.notFound("Item");
    const exists = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM items WHERE id = ${id}::uuid AND deleted_at IS NULL`;
    if (!exists[0]) throw Errors.notFound("Item");

    const versions = await tx.$queryRaw<ItemBomVersionSummary[]>`
      SELECT bv.id, bv.version, bv.status::text AS status,
             bv.effective_from::text AS "effectiveFrom",
             bv.effective_to::text   AS "effectiveTo",
             (SELECT count(*)::int FROM item_bom_lines bl
                WHERE bl.bom_version_id = bv.id AND bl.deleted_at IS NULL) AS "lineCount"
      FROM item_bom_versions bv
      WHERE bv.parent_item_id = ${id}::uuid AND bv.deleted_at IS NULL
      ORDER BY (bv.status = 'Active') DESC, bv.created_at DESC`;

    if (versions.length === 0) {
      return { itemId: id, versions: [], selectedVersionId: null, lines: [] };
    }

    // Pick the requested version if valid, else the first (Active-first order).
    const selected = (versionId && versions.find((v) => v.id === versionId)?.id) ?? versions[0].id;

    const lines = await tx.$queryRaw<ItemBomLineView[]>`
      SELECT bl.id,
             bl.child_item_id AS "childItemId",
             ci.code          AS "childCode",
             ci.name          AS "childName",
             ci.item_type::text AS "childItemType",
             bl.qty::float8   AS qty,
             bl.ref_des       AS "refDes",
             (SELECT b.slug FROM brands b WHERE b.id = bl.preferred_brand_id) AS "preferredBrandSlug",
             bl.sequence      AS sequence,
             bl.remarks       AS remarks,
             EXISTS (SELECT 1 FROM item_bom_versions cbv
                       WHERE cbv.parent_item_id = bl.child_item_id AND cbv.deleted_at IS NULL) AS "childHasBom"
      FROM item_bom_lines bl
      JOIN items ci ON ci.id = bl.child_item_id
      WHERE bl.bom_version_id = ${selected}::uuid AND bl.deleted_at IS NULL
      ORDER BY bl.sequence NULLS LAST, ci.code`;

    return { itemId: id, versions, selectedVersionId: selected, lines };
  });
}

// ── create ───────────────────────────────────────────────────────────────────

export interface CreateItemVariantInput {
  sourceKind?: ItemVariantSource;    // default 'purchased'
  brandId?: string | null;           // required when sourceKind='purchased'
  partNo?: string | null;
  isDefault?: boolean;               // exactly one variant is default; auto-elected if omitted
}

export interface CreateItemInput {
  code: string;
  /** Optional industry-standard part number (see P4b migration). Tenant-unique
   *  among live rows when non-null. */
  genericPn?: string | null;
  /** Board metadata (P5). Any subset — everything is nullable. */
  solderType?: SolderType | null;
  footprint?: string | null;
  spq?: number | null;
  /** Packaging metadata (P6). All nullable. Numeric fields must be strictly
   *  positive when set (matches the migration's CHECK constraints). */
  packageLengthMm?: number | null;
  packageWidthMm?: number | null;
  packageHeightMm?: number | null;
  packageWeightG?: number | null;
  tareWeightG?: number | null;
  packageMaterial?: string | null;
  packageReusable?: boolean | null;
  /** Storage / MSL metadata (P7). */
  storageTempMinC?: number | null;
  storageTempMaxC?: number | null;
  storageHumidityMinPct?: number | null;
  storageHumidityMaxPct?: number | null;
  mslLevel?: MslLevel | null;
  hazardous?: boolean | null;
  expiryTracked?: boolean | null;
  /** Asset metadata (P8). */
  custodianUserId?: string | null;
  serialNumber?: string | null;
  purchaseDate?: string | null;   // yyyy-mm-dd
  purchaseCost?: number | null;
  warrantyMonths?: number | null;
  usefulLifeMonths?: number | null;
  salvageValue?: number | null;
  depreciationMethod?: ItemDepreciationKind | null;
  conditionKind?: ItemCondition | null;
  name: string;
  description?: string | null;
  categoryId?: string | null;
  itemType?: ItemType;               // default 'raw'
  baseUom?: string;                  // default 'PCS'
  minStock?: number;
  reorderQty?: number;
  safetyStock?: number;
  leadTimeDays?: number | null;
  specs?: unknown;
  status?: ItemStatus;               // default 'active'
  /** Slice 3: sellable flag. Independent of stage. Defaults to false. */
  isFinishedGood?: boolean;
  variants?: CreateItemVariantInput[];
}

/** Create an item + its variants. If no variants are given, no stock atom
 *  exists yet — legal (an item can be defined before it is procured/produced).
 *  Enforces:
 *    • unique code per tenant across all item_types (DB partial unique index)
 *    • at most one manufactured variant per item (DB partial unique index)
 *    • one variant per (item, brand) for purchased variants (DB partial unique index)
 *    • exactly one is_default variant per item (auto-picks the first if omitted)
 */
export async function createItem(input: CreateItemInput): Promise<ItemView> {
  return guarded("item.create", async (tx, ctx) => {
    const code = input.code.trim();
    if (!code) throw Errors.badRequest("Item code is required");
    const name = input.name.trim();
    if (!name) throw Errors.badRequest("Item name is required");

    const itemType: ItemType = input.itemType ?? "raw";
    if (!ITEM_TYPES.has(itemType)) throw Errors.badRequest("Invalid itemType", { itemType });
    const status: ItemStatus = input.status ?? "active";
    if (!ITEM_STATUSES.has(status)) throw Errors.badRequest("Invalid status", { status });

    if (input.categoryId && !isUuid(input.categoryId)) {
      throw Errors.badRequest("Invalid categoryId");
    }

    // Dupe check is also enforced by the partial unique index; this returns
    // a clean 409 rather than a Postgres constraint error surface.
    const dupe = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM items
      WHERE company_id = ${ctx.companyId!}::uuid AND code = ${code} AND deleted_at IS NULL
      LIMIT 1`;
    if (dupe[0]) throw Errors.conflict("An item with this code already exists", { code });

    // Generic-PN uniqueness (P4b): only relevant when the caller supplies one.
    const genericPn = input.genericPn?.trim() || null;
    if (genericPn) {
      const dupePn = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM items
        WHERE company_id = ${ctx.companyId!}::uuid AND generic_pn = ${genericPn} AND deleted_at IS NULL
        LIMIT 1`;
      if (dupePn[0]) throw Errors.conflict("An item with this Generic PN already exists", { genericPn });
    }

    // Pre-validate variants before writing anything.
    const variantInputs = (input.variants ?? []).map((v, idx) => ({ v, idx }));
    let manufacturedCount = 0;
    const seenBrand = new Set<string>();
    for (const { v, idx } of variantInputs) {
      const sk: ItemVariantSource = v.sourceKind ?? "purchased";
      if (sk === "purchased") {
        if (!v.brandId || !isUuid(v.brandId)) {
          throw Errors.badRequest("Purchased variant requires a brandId", { variantIndex: idx });
        }
        if (seenBrand.has(v.brandId)) {
          throw Errors.badRequest("Duplicate brand across variants", { variantIndex: idx, brandId: v.brandId });
        }
        seenBrand.add(v.brandId);
      } else {
        if (v.brandId != null) {
          throw Errors.badRequest("Manufactured variant must not carry a brandId", { variantIndex: idx });
        }
        manufacturedCount++;
        if (manufacturedCount > 1) {
          throw Errors.badRequest("At most one manufactured variant per item", { variantIndex: idx });
        }
      }
    }

    // Pick the default variant. If the caller marks one, honour it; else the
    // first supplied variant becomes default; if no variants supplied, none.
    let defaultIdx = variantInputs.findIndex(({ v }) => v.isDefault);
    if (defaultIdx === -1 && variantInputs.length > 0) defaultIdx = 0;

    const specs = input.specs ?? [];

    const solderType = input.solderType ?? null;
    if (solderType && solderType !== "SMD" && solderType !== "DIP") {
      throw Errors.badRequest("solderType must be 'SMD' or 'DIP'");
    }
    const spq = input.spq ?? null;
    if (spq != null && (!Number.isInteger(spq) || spq <= 0)) {
      throw Errors.badRequest("spq must be a positive integer");
    }
    // Packaging positives (mirrors the DB CHECK — friendlier 400 than 23514).
    const positiveOrNull = (v: number | null | undefined, field: string): number | null => {
      if (v == null) return null;
      if (!(v > 0) || !Number.isFinite(v)) throw Errors.badRequest(`${field} must be a positive number`);
      return v;
    };
    const pkgL = positiveOrNull(input.packageLengthMm, "packageLengthMm");
    const pkgW = positiveOrNull(input.packageWidthMm,  "packageWidthMm");
    const pkgH = positiveOrNull(input.packageHeightMm, "packageHeightMm");
    const pkgWt = positiveOrNull(input.packageWeightG, "packageWeightG");
    const tareWt = positiveOrNull(input.tareWeightG,   "tareWeightG");

    // Storage / MSL guards (mirror the DB checks with clearer messages).
    const inRange = (v: number | null | undefined, lo: number, hi: number, field: string): number | null => {
      if (v == null) return null;
      if (!Number.isFinite(v) || v < lo || v > hi) throw Errors.badRequest(`${field} must be between ${lo} and ${hi}`);
      return v;
    };
    const tMin = inRange(input.storageTempMinC, -100, 200, "storageTempMinC");
    const tMax = inRange(input.storageTempMaxC, -100, 200, "storageTempMaxC");
    if (tMin != null && tMax != null && tMin > tMax) throw Errors.badRequest("storageTempMinC cannot exceed storageTempMaxC");
    const hMin = inRange(input.storageHumidityMinPct, 0, 100, "storageHumidityMinPct");
    const hMax = inRange(input.storageHumidityMaxPct, 0, 100, "storageHumidityMaxPct");
    if (hMin != null && hMax != null && hMin > hMax) throw Errors.badRequest("storageHumidityMinPct cannot exceed storageHumidityMaxPct");
    const mslLevel = input.mslLevel ?? null;
    if (mslLevel && !MSL_LEVELS.has(mslLevel)) throw Errors.badRequest("mslLevel must be one of J-STD-020 levels (1,2,2a,3,4,5,5a,6)");

    // Asset-register validations. Numeric checks mirror the DB CHECKs but with
    // friendlier messages; enum-values pre-check the same set the enum accepts.
    const nonNegOrNull = (v: number | null | undefined, field: string): number | null => {
      if (v == null) return null;
      if (!Number.isFinite(v) || v < 0) throw Errors.badRequest(`${field} cannot be negative`);
      return v;
    };
    const nonNegIntOrNull = (v: number | null | undefined, field: string): number | null => {
      if (v == null) return null;
      if (!Number.isInteger(v) || v < 0) throw Errors.badRequest(`${field} must be a non-negative integer`);
      return v;
    };
    const positiveIntOrNull = (v: number | null | undefined, field: string): number | null => {
      if (v == null) return null;
      if (!Number.isInteger(v) || v <= 0) throw Errors.badRequest(`${field} must be a positive integer`);
      return v;
    };
    const purchaseCost = nonNegOrNull(input.purchaseCost, "purchaseCost");
    const salvageValue = nonNegOrNull(input.salvageValue, "salvageValue");
    if (purchaseCost != null && salvageValue != null && salvageValue > purchaseCost) {
      throw Errors.badRequest("salvageValue cannot exceed purchaseCost");
    }
    const warrantyMonths    = nonNegIntOrNull(input.warrantyMonths,    "warrantyMonths");
    const usefulLifeMonths  = positiveIntOrNull(input.usefulLifeMonths, "usefulLifeMonths");
    const custodianUserId = input.custodianUserId ?? null;
    if (custodianUserId && !isUuid(custodianUserId)) throw Errors.badRequest("Invalid custodianUserId");
    const conditionKind = input.conditionKind ?? null;
    if (conditionKind && !ITEM_CONDITIONS.has(conditionKind)) throw Errors.badRequest("Invalid conditionKind");
    const depreciationMethod = input.depreciationMethod ?? null;
    if (depreciationMethod && !ITEM_DEPRECIATION_KIND.has(depreciationMethod)) throw Errors.badRequest("Invalid depreciationMethod");
    // Purchase date is trusted as ISO-yyyy-mm-dd from the API layer (zod does the format check).

    const inserted = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO items (
        company_id, code, generic_pn, solder_type, footprint, spq,
        package_length_mm, package_width_mm, package_height_mm,
        package_weight_g, tare_weight_g, package_material, package_reusable,
        storage_temp_min_c, storage_temp_max_c,
        storage_humidity_min_pct, storage_humidity_max_pct,
        msl_level, hazardous, expiry_tracked,
        custodian_user_id, serial_number, purchase_date, purchase_cost,
        warranty_months, useful_life_months, salvage_value,
        depreciation_method, condition_kind,
        name, description, category_id, item_type, base_uom,
        min_stock, reorder_qty, safety_stock, lead_time_days, specs, status,
        is_finished_good,
        created_by, updated_by
      ) VALUES (
        ${ctx.companyId!}::uuid, ${code}, ${genericPn},
        ${solderType}::solder_type_kind, ${input.footprint?.trim() || null}, ${spq},
        ${pkgL}, ${pkgW}, ${pkgH},
        ${pkgWt}, ${tareWt}, ${input.packageMaterial?.trim() || null}, ${input.packageReusable ?? null},
        ${tMin}, ${tMax}, ${hMin}, ${hMax},
        ${mslLevel}, ${input.hazardous ?? null}, ${input.expiryTracked ?? null},
        ${custodianUserId}::uuid, ${input.serialNumber?.trim() || null}, ${input.purchaseDate ?? null}::date, ${purchaseCost},
        ${warrantyMonths}, ${usefulLifeMonths}, ${salvageValue},
        ${depreciationMethod}::item_depreciation_kind, ${conditionKind}::item_condition_kind,
        ${name}, ${input.description ?? null},
        ${input.categoryId ?? null}::uuid, ${itemType}::item_type, ${input.baseUom ?? "PCS"},
        ${input.minStock ?? 0}, ${input.reorderQty ?? 0}, ${input.safetyStock ?? 0},
        ${input.leadTimeDays ?? null}, ${JSON.stringify(specs)}::jsonb, ${status}::item_status,
        ${input.isFinishedGood ?? false},
        ${ctx.userId}::uuid, ${ctx.userId}::uuid
      )
      RETURNING id`;
    const itemId = inserted[0].id;

    for (const { v, idx } of variantInputs) {
      const sk: ItemVariantSource = v.sourceKind ?? "purchased";
      await tx.$executeRaw`
        INSERT INTO item_variants (
          company_id, item_id, source_kind, brand_id, part_no, is_default,
          created_by, updated_by
        ) VALUES (
          ${ctx.companyId!}::uuid, ${itemId}::uuid,
          ${sk}::item_variant_source, ${v.brandId ?? null}::uuid,
          ${v.partNo?.trim() || null}, ${idx === defaultIdx},
          ${ctx.userId}::uuid, ${ctx.userId}::uuid
        )`;
    }

    return getItemInTx(tx, itemId);
  });
}

// ── add variant (add-form P3) ───────────────────────────────────────────────

export interface AddItemVariantInput {
  /** Brand name — resolved case-insensitively; created if missing. */
  brand: string;
  /** Manufacturer part number (MPN). Blank/empty is legal (a brand-only variant). */
  partNo?: string | null;
  /** If true, this variant becomes the item's default (any prior default is demoted).
   *  If the item has no default yet and this is the first variant, we default it. */
  isDefault?: boolean;
}

export interface ItemVariantCreated {
  itemId: string;
  variantId: string;
  brandId: string;
  brandSlug: string | null;
  partNo: string | null;
  isDefault: boolean;
}

/** Attach a purchased brand variant to an item. Manufactured variants stay
 *  singleton-per-item and are created only by createItem (and by legacy backfill
 *  in F2) — this endpoint does not model them. */
export async function addItemVariant(id: string, input: AddItemVariantInput): Promise<ItemVariantCreated> {
  return guarded("item.edit", async (tx, ctx) => {
    if (!isUuid(id)) throw Errors.notFound("Item");

    const item = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM items WHERE id = ${id}::uuid AND deleted_at IS NULL`;
    if (!item[0]) throw Errors.notFound("Item");

    const brandName = input.brand?.trim();
    if (!brandName) throw Errors.badRequest("Brand name is required");
    const brandId = await resolveOrCreateBrand(tx, ctx, brandName);

    // Enforce the F1 partial-unique index (company, item_id, brand_id where source=purchased)
    // with a friendly 409 before Postgres does.
    const dupe = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM item_variants
      WHERE company_id = ${ctx.companyId!}::uuid
        AND item_id = ${id}::uuid
        AND brand_id = ${brandId}::uuid
        AND source_kind = 'purchased'::item_variant_source
        AND deleted_at IS NULL
      LIMIT 1`;
    if (dupe[0]) throw Errors.conflict(
      "This brand already has a variant on this item",
      { brand: brandName },
      "Open the item and edit the existing variant instead of adding a new one.",
    );

    // Default-selection: at most one default per item. If the caller asked to
    // promote this variant, demote any prior default first. If nothing is
    // currently default (fresh item) and the caller didn't opt in, we still
    // mark this one default so the invariant "an item with variants has a
    // default" (from F1's uniqueness index) holds.
    const hasDefault = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM item_variants
      WHERE company_id = ${ctx.companyId!}::uuid
        AND item_id = ${id}::uuid
        AND is_default = true
        AND deleted_at IS NULL
      LIMIT 1`;
    const wantDefault = input.isDefault === true || hasDefault.length === 0;
    if (wantDefault && hasDefault.length > 0) {
      await tx.$executeRaw`
        UPDATE item_variants SET is_default = false, updated_by = ${ctx.userId}::uuid, updated_at = now()
        WHERE company_id = ${ctx.companyId!}::uuid AND item_id = ${id}::uuid AND is_default = true`;
    }

    const inserted = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO item_variants (
        company_id, item_id, source_kind, brand_id, part_no, is_default,
        created_by, updated_by
      ) VALUES (
        ${ctx.companyId!}::uuid, ${id}::uuid,
        'purchased'::item_variant_source, ${brandId}::uuid,
        ${input.partNo?.trim() || null}, ${wantDefault},
        ${ctx.userId}::uuid, ${ctx.userId}::uuid
      )
      RETURNING id`;

    const brand = await tx.brands.findUnique({ where: { id: brandId }, select: { slug: true } });
    return {
      itemId: id,
      variantId: inserted[0].id,
      brandId,
      brandSlug: brand?.slug ?? null,
      partNo: input.partNo?.trim() || null,
      isDefault: wantDefault,
    };
  });
}

// ── update (F5.1) ────────────────────────────────────────────────────────────

/** Source of a backfilled item — which legacy table it mirrors. Products and
 *  PCB revisions are rejected for edit in F5.1 (they have no legacy update
 *  paths yet); F5.6 will add them. Standalone items (created via `POST /api/items`
 *  after F1 rather than backfilled) count as `none`. */
type ItemSource = "component" | "product" | "pcb_revision" | "none";

async function resolveItemSource(tx: TxClient, itemId: string): Promise<ItemSource> {
  const rows = await tx.$queryRaw<{ src: ItemSource }[]>`
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM components     c  WHERE c.id  = ${itemId}::uuid) THEN 'component'
      WHEN EXISTS (SELECT 1 FROM products       p  WHERE p.id  = ${itemId}::uuid) THEN 'product'
      WHEN EXISTS (SELECT 1 FROM pcb_revisions  pr WHERE pr.id = ${itemId}::uuid) THEN 'pcb_revision'
      ELSE 'none'
    END AS src`;
  return rows[0]?.src ?? "none";
}

export interface UpdateItemInput {
  code?: string;
  genericPn?: string | null;
  solderType?: SolderType | null;
  footprint?: string | null;
  spq?: number | null;
  packageLengthMm?: number | null;
  packageWidthMm?: number | null;
  packageHeightMm?: number | null;
  packageWeightG?: number | null;
  tareWeightG?: number | null;
  packageMaterial?: string | null;
  packageReusable?: boolean | null;
  storageTempMinC?: number | null;
  storageTempMaxC?: number | null;
  storageHumidityMinPct?: number | null;
  storageHumidityMaxPct?: number | null;
  mslLevel?: MslLevel | null;
  hazardous?: boolean | null;
  expiryTracked?: boolean | null;
  custodianUserId?: string | null;
  serialNumber?: string | null;
  purchaseDate?: string | null;
  purchaseCost?: number | null;
  warrantyMonths?: number | null;
  usefulLifeMonths?: number | null;
  salvageValue?: number | null;
  depreciationMethod?: ItemDepreciationKind | null;
  conditionKind?: ItemCondition | null;
  name?: string;
  description?: string | null;
  categoryId?: string | null;
  baseUom?: string;
  minStock?: number;
  reorderQty?: number;
  safetyStock?: number;
  leadTimeDays?: number | null;
  specs?: unknown;
  status?: ItemStatus;
  /** Slice 3: flip the sellable flag on/off. Independent of stage. */
  isFinishedGood?: boolean;
  // Deliberately no `itemType` — reclassifying an item is a workflow of its
  // own (moves it between master lists) and belongs to a later slice.
}

/** Edit an item's master fields. Dual-writes matching fields back to the
 *  underlying `components` row for backfilled items so legacy screens stay
 *  in sync. Product- and PCB-revision-backed items are rejected in F5.1 — the
 *  caller is pointed at the legacy screen via the 400's hint. */
export async function updateItem(id: string, patch: UpdateItemInput): Promise<ItemView> {
  return guarded("item.edit", async (tx, ctx) => {
    if (!isUuid(id)) throw Errors.notFound("Item");

    const existing = await tx.$queryRaw<{ id: string; code: string; itemType: ItemType }[]>`
      SELECT id, code, item_type::text AS "itemType"
      FROM items WHERE id = ${id}::uuid AND deleted_at IS NULL`;
    if (!existing[0]) throw Errors.notFound("Item");
    const source = await resolveItemSource(tx, id);

    if (source === "product" || source === "pcb_revision") {
      throw Errors.badRequest(
        source === "product"
          ? "Editing product items via /api/items is not available yet"
          : "Editing PCB-revision items via /api/items is not available yet",
        { itemId: id, source },
        source === "product"
          ? "Open the product in Products → Product List to edit its master data. Universal Item edit for products lands in the next slice."
          : "Open the PCB in PCB Management → PCB Structure to edit its revision. Universal Item edit for PCB revisions lands in the next slice.",
      );
    }

    // Validate the fields the client sent. Missing keys are left untouched.
    const nextCode = patch.code?.trim();
    if (patch.code !== undefined && !nextCode) throw Errors.badRequest("Item code cannot be empty");
    const nextName = patch.name?.trim();
    if (patch.name !== undefined && !nextName) throw Errors.badRequest("Item name cannot be empty");
    if (patch.status !== undefined && !ITEM_STATUSES.has(patch.status)) {
      throw Errors.badRequest("Invalid status", { status: patch.status });
    }
    if (patch.categoryId !== undefined && patch.categoryId !== null && !isUuid(patch.categoryId)) {
      throw Errors.badRequest("Invalid categoryId");
    }
    if (patch.baseUom !== undefined && !patch.baseUom.trim()) {
      throw Errors.badRequest("Base UOM cannot be empty");
    }

    // Code uniqueness. items.code is unique per tenant across all types (F1
    // partial unique index); check here first so we return 409 rather than the
    // Postgres constraint error surface. Note: for a component-backed item this
    // ALSO becomes the new components.generic_pn, which has its own tenant-wide
    // unique index — the same check covers both because we backfilled them 1:1.
    if (nextCode && nextCode !== existing[0].code) {
      const dupe = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM items
        WHERE company_id = ${ctx.companyId!}::uuid
          AND code = ${nextCode}
          AND deleted_at IS NULL
          AND id <> ${id}::uuid
        LIMIT 1`;
      if (dupe[0]) throw Errors.conflict("An item with this code already exists", { code: nextCode });
    }

    // Generic-PN uniqueness — only when a non-null value is being set. Blank
    // ("") is treated as "clear it" and passes without conflict.
    const nextGenericPn = patch.genericPn === undefined ? undefined : (patch.genericPn?.trim() || null);
    if (nextGenericPn) {
      const dupePn = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM items
        WHERE company_id = ${ctx.companyId!}::uuid
          AND generic_pn = ${nextGenericPn}
          AND deleted_at IS NULL
          AND id <> ${id}::uuid
        LIMIT 1`;
      if (dupePn[0]) throw Errors.conflict("An item with this Generic PN already exists", { genericPn: nextGenericPn });
    }

    // Update the items row. Only touched fields are set (via IS NOT DISTINCT
    // FROM sentinel pattern in raw SQL would work but is noisy — building the
    // fragment inline is clearer). Every UPDATE bumps updated_by / updated_at.
    const sets: Prisma.Sql[] = [
      Prisma.sql`updated_by = ${ctx.userId}::uuid`,
      Prisma.sql`updated_at = now()`,
    ];
    if (nextCode !== undefined)                  sets.push(Prisma.sql`code = ${nextCode}`);
    if (patch.genericPn !== undefined)           sets.push(Prisma.sql`generic_pn = ${nextGenericPn}`);
    if (patch.solderType !== undefined) {
      if (patch.solderType && patch.solderType !== "SMD" && patch.solderType !== "DIP") {
        throw Errors.badRequest("solderType must be 'SMD' or 'DIP'");
      }
      sets.push(Prisma.sql`solder_type = ${patch.solderType}::solder_type_kind`);
    }
    if (patch.footprint !== undefined)           sets.push(Prisma.sql`footprint = ${patch.footprint?.trim() || null}`);
    if (patch.spq !== undefined) {
      if (patch.spq != null && (!Number.isInteger(patch.spq) || patch.spq <= 0)) {
        throw Errors.badRequest("spq must be a positive integer");
      }
      sets.push(Prisma.sql`spq = ${patch.spq}`);
    }
    // Packaging positives — same friendly-400 shape as create.
    const patchPositive = (v: number | null | undefined, field: string): number | null | undefined => {
      if (v === undefined) return undefined;
      if (v == null) return null;
      if (!(v > 0) || !Number.isFinite(v)) throw Errors.badRequest(`${field} must be a positive number`);
      return v;
    };
    const pkgL = patchPositive(patch.packageLengthMm, "packageLengthMm");
    const pkgW = patchPositive(patch.packageWidthMm,  "packageWidthMm");
    const pkgH = patchPositive(patch.packageHeightMm, "packageHeightMm");
    const pkgWt = patchPositive(patch.packageWeightG, "packageWeightG");
    const tareWt = patchPositive(patch.tareWeightG,   "tareWeightG");
    if (pkgL   !== undefined) sets.push(Prisma.sql`package_length_mm = ${pkgL}`);
    if (pkgW   !== undefined) sets.push(Prisma.sql`package_width_mm  = ${pkgW}`);
    if (pkgH   !== undefined) sets.push(Prisma.sql`package_height_mm = ${pkgH}`);
    if (pkgWt  !== undefined) sets.push(Prisma.sql`package_weight_g  = ${pkgWt}`);
    if (tareWt !== undefined) sets.push(Prisma.sql`tare_weight_g     = ${tareWt}`);
    if (patch.packageMaterial !== undefined) sets.push(Prisma.sql`package_material = ${patch.packageMaterial?.trim() || null}`);
    if (patch.packageReusable !== undefined) sets.push(Prisma.sql`package_reusable = ${patch.packageReusable}`);

    // Storage / MSL — same range guards as create, expressed as a small helper.
    const patchRange = (v: number | null | undefined, lo: number, hi: number, field: string): number | null | undefined => {
      if (v === undefined) return undefined;
      if (v == null) return null;
      if (!Number.isFinite(v) || v < lo || v > hi) throw Errors.badRequest(`${field} must be between ${lo} and ${hi}`);
      return v;
    };
    const tMinU = patchRange(patch.storageTempMinC, -100, 200, "storageTempMinC");
    const tMaxU = patchRange(patch.storageTempMaxC, -100, 200, "storageTempMaxC");
    const hMinU = patchRange(patch.storageHumidityMinPct, 0, 100, "storageHumidityMinPct");
    const hMaxU = patchRange(patch.storageHumidityMaxPct, 0, 100, "storageHumidityMaxPct");
    if (tMinU != null && tMaxU != null && tMinU > tMaxU) throw Errors.badRequest("storageTempMinC cannot exceed storageTempMaxC");
    if (hMinU != null && hMaxU != null && hMinU > hMaxU) throw Errors.badRequest("storageHumidityMinPct cannot exceed storageHumidityMaxPct");
    if (tMinU !== undefined) sets.push(Prisma.sql`storage_temp_min_c        = ${tMinU}`);
    if (tMaxU !== undefined) sets.push(Prisma.sql`storage_temp_max_c        = ${tMaxU}`);
    if (hMinU !== undefined) sets.push(Prisma.sql`storage_humidity_min_pct  = ${hMinU}`);
    if (hMaxU !== undefined) sets.push(Prisma.sql`storage_humidity_max_pct  = ${hMaxU}`);
    if (patch.mslLevel !== undefined) {
      if (patch.mslLevel && !MSL_LEVELS.has(patch.mslLevel)) throw Errors.badRequest("mslLevel must be one of J-STD-020 levels (1,2,2a,3,4,5,5a,6)");
      sets.push(Prisma.sql`msl_level = ${patch.mslLevel}`);
    }
    if (patch.hazardous !== undefined)     sets.push(Prisma.sql`hazardous       = ${patch.hazardous}`);
    if (patch.expiryTracked !== undefined) sets.push(Prisma.sql`expiry_tracked  = ${patch.expiryTracked}`);

    // Asset-register patches. Shape-match the create helpers.
    const patchNonNeg = (v: number | null | undefined, field: string) => {
      if (v === undefined) return undefined;
      if (v == null) return null;
      if (!Number.isFinite(v) || v < 0) throw Errors.badRequest(`${field} cannot be negative`);
      return v;
    };
    const patchNonNegInt = (v: number | null | undefined, field: string) => {
      if (v === undefined) return undefined;
      if (v == null) return null;
      if (!Number.isInteger(v) || v < 0) throw Errors.badRequest(`${field} must be a non-negative integer`);
      return v;
    };
    const patchPositiveInt = (v: number | null | undefined, field: string) => {
      if (v === undefined) return undefined;
      if (v == null) return null;
      if (!Number.isInteger(v) || v <= 0) throw Errors.badRequest(`${field} must be a positive integer`);
      return v;
    };
    const purchaseCostU  = patchNonNeg(patch.purchaseCost, "purchaseCost");
    const salvageValueU  = patchNonNeg(patch.salvageValue, "salvageValue");
    if (purchaseCostU != null && salvageValueU != null && salvageValueU > purchaseCostU) {
      throw Errors.badRequest("salvageValue cannot exceed purchaseCost");
    }
    if (patch.custodianUserId !== undefined) {
      if (patch.custodianUserId && !isUuid(patch.custodianUserId)) throw Errors.badRequest("Invalid custodianUserId");
      sets.push(Prisma.sql`custodian_user_id = ${patch.custodianUserId}::uuid`);
    }
    if (patch.serialNumber !== undefined) sets.push(Prisma.sql`serial_number = ${patch.serialNumber?.trim() || null}`);
    if (patch.purchaseDate !== undefined) sets.push(Prisma.sql`purchase_date = ${patch.purchaseDate}::date`);
    if (purchaseCostU !== undefined)      sets.push(Prisma.sql`purchase_cost = ${purchaseCostU}`);
    const warrantyMonthsU   = patchNonNegInt(patch.warrantyMonths,   "warrantyMonths");
    const usefulLifeMonthsU = patchPositiveInt(patch.usefulLifeMonths, "usefulLifeMonths");
    if (warrantyMonthsU   !== undefined) sets.push(Prisma.sql`warranty_months    = ${warrantyMonthsU}`);
    if (usefulLifeMonthsU !== undefined) sets.push(Prisma.sql`useful_life_months = ${usefulLifeMonthsU}`);
    if (salvageValueU !== undefined)     sets.push(Prisma.sql`salvage_value      = ${salvageValueU}`);
    if (patch.depreciationMethod !== undefined) {
      if (patch.depreciationMethod && !ITEM_DEPRECIATION_KIND.has(patch.depreciationMethod)) {
        throw Errors.badRequest("Invalid depreciationMethod");
      }
      sets.push(Prisma.sql`depreciation_method = ${patch.depreciationMethod}::item_depreciation_kind`);
    }
    if (patch.conditionKind !== undefined) {
      if (patch.conditionKind && !ITEM_CONDITIONS.has(patch.conditionKind)) {
        throw Errors.badRequest("Invalid conditionKind");
      }
      sets.push(Prisma.sql`condition_kind = ${patch.conditionKind}::item_condition_kind`);
    }

    if (nextName !== undefined)                  sets.push(Prisma.sql`name = ${nextName}`);
    if (patch.description !== undefined)         sets.push(Prisma.sql`description = ${patch.description?.trim() || null}`);
    if (patch.categoryId !== undefined)          sets.push(Prisma.sql`category_id = ${patch.categoryId}::uuid`);
    if (patch.baseUom !== undefined)             sets.push(Prisma.sql`base_uom = ${patch.baseUom.trim()}`);
    if (patch.minStock !== undefined)            sets.push(Prisma.sql`min_stock = ${patch.minStock}`);
    if (patch.reorderQty !== undefined)          sets.push(Prisma.sql`reorder_qty = ${patch.reorderQty}`);
    if (patch.safetyStock !== undefined)         sets.push(Prisma.sql`safety_stock = ${patch.safetyStock}`);
    if (patch.leadTimeDays !== undefined)        sets.push(Prisma.sql`lead_time_days = ${patch.leadTimeDays}`);
    if (patch.specs !== undefined)               sets.push(Prisma.sql`specs = ${JSON.stringify(patch.specs ?? [])}::jsonb`);
    if (patch.status !== undefined)              sets.push(Prisma.sql`status = ${patch.status}::item_status`);
    if (patch.isFinishedGood !== undefined)      sets.push(Prisma.sql`is_finished_good = ${patch.isFinishedGood}`);

    await tx.$executeRaw(Prisma.sql`
      UPDATE items SET ${Prisma.join(sets, ", ")}
      WHERE id = ${id}::uuid`);

    // Dual-write to components. Only the columns that actually exist on
    // `components` propagate — safety_stock, lead_time_days, status, specs live
    // only on `items` and stay there.
    if (source === "component") {
      const cSets: Prisma.Sql[] = [
        Prisma.sql`updated_by = ${ctx.userId}::uuid`,
        Prisma.sql`updated_at = now()`,
      ];
      if (nextCode !== undefined)              cSets.push(Prisma.sql`generic_pn = ${nextCode}`);
      if (nextName !== undefined)              cSets.push(Prisma.sql`name = ${nextName}`);
      if (patch.description !== undefined)     cSets.push(Prisma.sql`description = ${patch.description?.trim() || null}`);
      if (patch.categoryId !== undefined)      cSets.push(Prisma.sql`category_id = ${patch.categoryId}::uuid`);
      if (patch.baseUom !== undefined)         cSets.push(Prisma.sql`unit = ${patch.baseUom.trim()}`);
      if (patch.minStock !== undefined)        cSets.push(Prisma.sql`min_stock = ${patch.minStock}`);
      if (patch.reorderQty !== undefined)      cSets.push(Prisma.sql`reorder_qty = ${patch.reorderQty}`);
      if (patch.solderType !== undefined)      cSets.push(Prisma.sql`solder_type = ${patch.solderType}`);
      if (patch.footprint !== undefined)       cSets.push(Prisma.sql`footprint = ${patch.footprint?.trim() || null}`);
      if (patch.spq !== undefined)             cSets.push(Prisma.sql`spq = ${patch.spq}`);
      // Only touch components if at least one non-audit column was set.
      if (cSets.length > 2) {
        await tx.$executeRaw(Prisma.sql`
          UPDATE components SET ${Prisma.join(cSets, ", ")}
          WHERE id = ${id}::uuid`);
      }
    }

    return getItemInTx(tx, id);
  });
}

// ── delete (F5.1) ────────────────────────────────────────────────────────────

/** Soft-delete an item, its variants, and the underlying legacy row.
 *  Guards (return 409 with a hint):
 *    • any variant has positive on-hand anywhere
 *    • component-backed item is referenced by a live PCB BOM line
 *  Product- and PCB-revision-backed items are rejected in F5.1 (see updateItem). */
export async function deleteItem(id: string): Promise<{ id: string; code: string }> {
  return guarded("item.delete", async (tx, ctx) => {
    if (!isUuid(id)) throw Errors.notFound("Item");

    const existing = await tx.$queryRaw<{ id: string; code: string }[]>`
      SELECT id, code FROM items WHERE id = ${id}::uuid AND deleted_at IS NULL`;
    if (!existing[0]) throw Errors.notFound("Item");

    const source = await resolveItemSource(tx, id);
    if (source === "product" || source === "pcb_revision") {
      throw Errors.badRequest(
        source === "product"
          ? "Deleting product items via /api/items is not available yet"
          : "Deleting PCB-revision items via /api/items is not available yet",
        { itemId: id, source },
        "Delete the item from its legacy screen for now. Universal Item delete for this type lands in the next slice.",
      );
    }

    // Guard 1: any variant still holding stock, at any location.
    const stock = await tx.$queryRaw<{ onHand: number }[]>`
      SELECT COALESCE(SUM(ib.on_hand), 0)::float8 AS "onHand"
      FROM inventory_balances ib
      JOIN item_variants v ON v.id = ib.item_variant_id
      WHERE v.item_id = ${id}::uuid AND ib.deleted_at IS NULL`;
    if ((stock[0]?.onHand ?? 0) > 0) {
      throw Errors.conflict(
        "This item still has on-hand stock and cannot be deleted",
        { onHand: stock[0]?.onHand ?? 0 },
        "Move or write off the remaining stock first (Inventory → Stock Move / Adjustment), then retry the delete.",
      );
    }

    // Guard 2: component-backed items used in any live PCB BOM. Mirrors the
    // check in deleteComponent (data/components.ts) so the hint matches.
    if (source === "component") {
      const inUse = await tx.$queryRaw<{ one: number }[]>`
        SELECT 1 AS one
        FROM pcb_lines pl
        JOIN pcb_revisions pr ON pr.id = pl.pcb_revision_id AND pr.deleted_at IS NULL
        JOIN pcbs p           ON p.id  = pr.pcb_id          AND p.deleted_at  IS NULL
        WHERE pl.component_id = ${id}::uuid AND pl.deleted_at IS NULL
        LIMIT 1`;
      if (inUse.length) {
        throw Errors.conflict(
          "Item is used in one or more PCB BOMs and cannot be deleted",
          undefined,
          "Open each PCB structure that lists this item and swap or remove the BOM line, then retry.",
        );
      }
    }

    // Soft-delete order: variants first (so nothing looks half-alive if a
    // subsequent statement fails), then the legacy row, then the item itself.
    await tx.$executeRaw`
      UPDATE item_variants SET deleted_at = now(), updated_by = ${ctx.userId}::uuid
      WHERE item_id = ${id}::uuid AND deleted_at IS NULL`;

    if (source === "component") {
      // Match deleteComponent's cascade: sweep the CBVs and price book alongside.
      await tx.$executeRaw`
        UPDATE component_brand_variants SET deleted_at = now(), updated_by = ${ctx.userId}::uuid
        WHERE component_id = ${id}::uuid AND deleted_at IS NULL`;
      await tx.$executeRaw`
        UPDATE supplier_component_prices SET deleted_at = now(), updated_by = ${ctx.userId}::uuid
        WHERE component_id = ${id}::uuid AND deleted_at IS NULL`;
      await tx.$executeRaw`
        UPDATE components SET deleted_at = now(), updated_by = ${ctx.userId}::uuid
        WHERE id = ${id}::uuid AND deleted_at IS NULL`;
    }

    await tx.$executeRaw`
      UPDATE items SET deleted_at = now(), updated_by = ${ctx.userId}::uuid
      WHERE id = ${id}::uuid`;

    return { id, code: existing[0].code };
  });
}
