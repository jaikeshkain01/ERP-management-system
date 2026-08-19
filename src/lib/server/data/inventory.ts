/**
 * Inventory ledger (Postgres). THE write path is `createInventoryTransaction`:
 * it appends immutable `inventory_transactions` rows; the DB trigger
 * (apply_inventory_txn) projects them into `inventory_balances`. Stock is never
 * written directly (ARCHITECTURE.md §7a).
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { withTenant, type TenantContext, type TxClient } from "@/lib/prisma";
import { Errors } from "@/lib/server/http";
import { assertPermission } from "@/lib/server/rbac";
import { requireSession } from "@/lib/server/session";
import { isUuid } from "@/lib/server/data/util";

// ── shapes ───────────────────────────────────────────────────────────────────
export interface BalanceView {
  variantId: string;
  componentId: string;
  genericPN: string;
  componentName: string;
  brandId: string;
  brandSlug: string;
  partNo: string | null;
  warehouseId: string;
  warehouseCode: string;
  locationId: string;
  locationCode: string;
  onHand: number;
  reserved: number;
  available: number;
  damaged: number;
}

export interface LedgerView {
  id: string;
  type: string;
  variantId: string;
  componentId: string;
  genericPN: string;
  brandId: string;
  brandSlug: string;
  warehouseId: string;
  locationId: string;
  qtyDelta: number;
  transferGroupId: string | null;
  refType: string | null;
  refId: string | null;
  grnNo: string | null;
  reason: string | null;
  note: string | null;
  lotNo: string | null;
  supplierSlug: string | null;
  createdAt: string;
}

export interface ComponentStockView {
  componentId: string;
  genericPN: string;
  onHand: number;
  reserved: number;
  available: number;
  damaged: number;
  byWarehouse: { warehouseId: string; code: string; onHand: number }[];
  byVariant: { variantId: string; brandId: string; brandSlug: string; partNo: string | null; onHand: number; available: number }[];
  byLot: { lotNo: string; partNo: string | null; expiryDate: string | null; unitCost: number | null; onHand: number; value: number }[];
}

export interface BalanceFilters {
  componentId?: string;
  variantId?: string;
  warehouseId?: string;
  locationId?: string;
}

export interface LedgerFilters {
  variantId?: string;
  warehouseId?: string;
  locationId?: string;
  type?: string;
  from?: string;
  to?: string;
  limit?: number;
}

const POSITIVE_TYPES = new Set(["IN", "RETURN", "PRODUCTION"]);
const NEGATIVE_TYPES = new Set(["OUT", "CONSUMPTION"]);

/** Request body for POST /inventory/transactions (validated + refined). */
export const InventoryTxnBody = z
  .object({
    type: z.enum(["IN", "OUT", "TRANSFER", "ADJUSTMENT", "RETURN", "CONSUMPTION", "PRODUCTION"]),
    // Identify the variant by UUID, or by business keys (generic P/N + brand slug)
    // so a never-stocked variant can be moved without a pre-existing balance row.
    variantId: z.string().uuid().optional(),
    genericPN: z.string().min(1).optional(),
    brandSlug: z.string().min(1).optional(),
    locationId: z.string().uuid().optional(),
    fromLocationId: z.string().uuid().optional(),
    toLocationId: z.string().uuid().optional(),
    qty: z.number().positive().optional(),
    qtyDelta: z.number().optional(),
    reason: z.string().max(500).optional(),
    note: z.string().max(1000).optional(),
    refType: z.string().max(100).optional(),
    refId: z.string().uuid().optional(),
    grnNo: z.string().max(100).optional(),
    // Lot capture on inbound movements (IN/RETURN/PRODUCTION). Blank lotNo → auto.
    lotNo: z.string().max(100).optional(),
    expiryDate: z.string().optional(), // ISO date (YYYY-MM-DD)
    unitCost: z.number().nonnegative().optional(),
    supplierSlug: z.string().max(200).optional(), // inbound: recorded on the lot
    // Outbound override: pin the move to a specific lot instead of the FEFO
    // default. Ignored on inbound (the lotNo/expiryDate/etc. fields above take
    // over there). Server validates the lot belongs to the variant and has
    // sufficient on-hand at the source location.
    lotId: z.string().uuid().optional(),
    // Outbound multi-lot allocations: manually split a single stock-out across
    // several lots. Sum of qtys must equal the top-level `qty`. When set, this
    // wins over both `lotId` and FEFO — one ledger row per allocation.
    lotAllocations: z.array(z.object({
      lotId: z.string().uuid(),
      qty: z.number().positive(),
    })).optional(),
  })
  .superRefine((b, ctx) => {
    if (!b.variantId && !(b.genericPN && b.brandSlug)) {
      ctx.addIssue({ code: "custom", message: "Provide variantId, or genericPN and brandSlug" });
    }
    if (b.type === "TRANSFER") {
      if (!b.fromLocationId || !b.toLocationId) ctx.addIssue({ code: "custom", message: "TRANSFER needs fromLocationId and toLocationId" });
      if (b.fromLocationId && b.fromLocationId === b.toLocationId) ctx.addIssue({ code: "custom", message: "TRANSFER source and destination must differ" });
      if (b.qty == null) ctx.addIssue({ code: "custom", message: "TRANSFER needs a positive qty" });
    } else if (b.type === "ADJUSTMENT") {
      if (b.qtyDelta == null || b.qtyDelta === 0) ctx.addIssue({ code: "custom", message: "ADJUSTMENT needs a non-zero qtyDelta" });
    } else {
      // locationId is optional here — a default storage location is used when omitted.
      if (b.qty == null) ctx.addIssue({ code: "custom", message: `${b.type} needs a positive qty` });
    }
  });

export type InventoryTxnInput = z.infer<typeof InventoryTxnBody>;

// ── helpers ──────────────────────────────────────────────────────────────────
async function guarded<T>(perm: string, fn: (tx: TxClient, ctx: TenantContext) => Promise<T>): Promise<T> {
  const ctx = await requireSession();
  return withTenant(ctx, async (tx) => {
    await assertPermission(tx, ctx, perm);
    return fn(tx, ctx);
  });
}

function balanceSelect(where: Prisma.Sql) {
  return Prisma.sql`
    SELECT ib.component_brand_variant_id AS "variantId",
      c.id AS "componentId", c.generic_pn AS "genericPN", c.name AS "componentName",
      b.id AS "brandId", b.slug AS "brandSlug", v.part_no AS "partNo",
      ib.warehouse_id AS "warehouseId", w.code AS "warehouseCode",
      ib.location_id AS "locationId", sl.code AS "locationCode",
      ib.on_hand::float8 AS "onHand", ib.reserved::float8 AS reserved,
      ib.available::float8 AS available, ib.damaged::float8 AS damaged
    FROM inventory_balances ib
    JOIN component_brand_variants v ON v.id = ib.component_brand_variant_id
    JOIN components c ON c.id = v.component_id
    JOIN brands b ON b.id = v.brand_id
    JOIN warehouses w ON w.id = ib.warehouse_id
    JOIN storage_locations sl ON sl.id = ib.location_id
    WHERE ib.deleted_at IS NULL ${where}
    ORDER BY c.name, b.slug`;
}

/** Resolve a variant UUID from its business keys (generic P/N + brand slug/id/name), creating variant if missing. */
async function resolveVariantByKeys(tx: TxClient, genericPN: string, brandSlug: string): Promise<string> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT v.id FROM component_brand_variants v
    JOIN components c ON c.id = v.component_id
    JOIN brands b ON b.id = v.brand_id
    WHERE (c.generic_pn = ${genericPN} OR c.id::text = ${genericPN})
      AND (b.slug = ${brandSlug} OR b.id::text = ${brandSlug} OR b.name ILIKE ${brandSlug})
      AND v.deleted_at IS NULL AND c.deleted_at IS NULL AND b.deleted_at IS NULL
    LIMIT 1`;
  if (rows[0]) return rows[0].id;

  const comp = await tx.components.findFirst({
    where: { deleted_at: null, OR: [{ generic_pn: genericPN }, ...(isUuid(genericPN) ? [{ id: genericPN }] : [])] },
    select: { id: true, generic_pn: true, company_id: true, created_by: true },
  });
  if (!comp) throw Errors.badRequest("Unknown component", { genericPN });

  const brand = await tx.brands.findFirst({
    where: {
      deleted_at: null,
      OR: [
        { slug: brandSlug },
        ...(isUuid(brandSlug) ? [{ id: brandSlug }] : []),
        { name: { equals: brandSlug, mode: "insensitive" } },
      ],
    },
    select: { id: true, slug: true },
  });
  if (!brand) throw Errors.badRequest("Unknown brand", { brandSlug });

  const existingVariant = await tx.component_brand_variants.findFirst({
    where: { component_id: comp.id, brand_id: brand.id, deleted_at: null },
    select: { id: true },
  });
  if (existingVariant) return existingVariant.id;

  const newVariant = await tx.component_brand_variants.create({
    data: {
      company_id: comp.company_id,
      component_id: comp.id,
      brand_id: brand.id,
      part_no: comp.generic_pn,
      created_by: comp.created_by,
      updated_by: comp.created_by,
    },
    select: { id: true },
  });
  return newVariant.id;
}

/** A default storage location to stock into when the caller doesn't name one
 *  (prefers the default bin, then the oldest location). Tenant-scoped by RLS. */
async function defaultLocation(tx: TxClient): Promise<string> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM storage_locations
    WHERE deleted_at IS NULL
    ORDER BY (is_default AND kind = 'bin') DESC, created_at ASC
    LIMIT 1`;
  if (!rows[0]) throw Errors.badRequest("No storage location configured — create a warehouse and location first.");
  return rows[0].id;
}

async function warehouseForLocation(tx: TxClient, locationId: string): Promise<string> {
  const loc = await tx.storage_locations.findFirst({ where: { id: locationId, deleted_at: null }, select: { warehouse_id: true } });
  if (!loc) throw Errors.badRequest("Unknown location", { locationId });
  return loc.warehouse_id;
}

async function availableAt(tx: TxClient, variantId: string, locationId: string): Promise<number> {
  const rows = await tx.$queryRaw<{ available: number }[]>`
    SELECT available::float8 AS available FROM inventory_balances
    WHERE component_brand_variant_id = ${variantId}::uuid AND location_id = ${locationId}::uuid AND deleted_at IS NULL`;
  return rows[0]?.available ?? 0;
}

// ── reads ────────────────────────────────────────────────────────────────────
export async function listBalances(f: BalanceFilters): Promise<BalanceView[]> {
  return guarded("inventory.view", async (tx) => {
    const cond: Prisma.Sql[] = [];
    if (f.componentId && isUuid(f.componentId)) cond.push(Prisma.sql`AND c.id = ${f.componentId}::uuid`);
    if (f.variantId) cond.push(Prisma.sql`AND ib.component_brand_variant_id = ${f.variantId}::uuid`);
    if (f.warehouseId) cond.push(Prisma.sql`AND ib.warehouse_id = ${f.warehouseId}::uuid`);
    if (f.locationId) cond.push(Prisma.sql`AND ib.location_id = ${f.locationId}::uuid`);
    return tx.$queryRaw<BalanceView[]>(balanceSelect(cond.length ? Prisma.join(cond, " ") : Prisma.empty));
  });
}

export async function listLedger(f: LedgerFilters): Promise<LedgerView[]> {
  return guarded("inventory.view", async (tx) => {
    const cond: Prisma.Sql[] = [];
    if (f.variantId) cond.push(Prisma.sql`AND it.component_brand_variant_id = ${f.variantId}::uuid`);
    if (f.warehouseId) cond.push(Prisma.sql`AND it.warehouse_id = ${f.warehouseId}::uuid`);
    if (f.locationId) cond.push(Prisma.sql`AND it.location_id = ${f.locationId}::uuid`);
    if (f.type) cond.push(Prisma.sql`AND it.type = ${f.type}::inventory_txn_type`);
    if (f.from) cond.push(Prisma.sql`AND it.created_at >= ${f.from}::timestamptz`);
    if (f.to) cond.push(Prisma.sql`AND it.created_at <= ${f.to}::timestamptz`);
    const limit = Math.min(Math.max(f.limit ?? 200, 1), 1000);
    return tx.$queryRaw<LedgerView[]>`
      SELECT it.id, it.type, it.component_brand_variant_id AS "variantId",
        v.component_id AS "componentId", c.generic_pn AS "genericPN", v.brand_id AS "brandId",
        b.slug AS "brandSlug",
        it.warehouse_id AS "warehouseId", it.location_id AS "locationId",
        it.qty_delta::float8 AS "qtyDelta", it.transfer_group_id AS "transferGroupId",
        it.ref_type AS "refType", it.ref_id AS "refId", it.grn_no AS "grnNo",
        it.reason, it.note, il.lot_no AS "lotNo", sup.slug AS "supplierSlug", it.created_at AS "createdAt"
      FROM inventory_transactions it
      JOIN component_brand_variants v ON v.id = it.component_brand_variant_id
      JOIN components c ON c.id = v.component_id
      JOIN brands b ON b.id = v.brand_id
      LEFT JOIN item_lots il ON il.id = it.lot_id
      LEFT JOIN suppliers sup ON sup.id = il.supplier_id
      WHERE 1 = 1 ${cond.length ? Prisma.join(cond, " ") : Prisma.empty}
      ORDER BY it.created_at DESC
      LIMIT ${limit}`;
  });
}

export async function getComponentStock(idOrPn: string): Promise<ComponentStockView> {
  return guarded("inventory.view", async (tx) => {
    const comp = await tx.components.findFirst({
      where: { deleted_at: null, ...(isUuid(idOrPn) ? { id: idOrPn } : { generic_pn: idOrPn }) },
      select: { id: true, generic_pn: true },
    });
    if (!comp) throw Errors.notFound("Component");

    const [tot] = await tx.$queryRaw<{ onHand: number; reserved: number; available: number; damaged: number }[]>`
      SELECT COALESCE(SUM(ib.on_hand),0)::float8 AS "onHand", COALESCE(SUM(ib.reserved),0)::float8 AS reserved,
             COALESCE(SUM(ib.available),0)::float8 AS available, COALESCE(SUM(ib.damaged),0)::float8 AS damaged
      FROM inventory_balances ib JOIN component_brand_variants v ON v.id = ib.component_brand_variant_id
      WHERE v.component_id = ${comp.id}::uuid AND ib.deleted_at IS NULL`;

    const byWarehouse = await tx.$queryRaw<{ warehouseId: string; code: string; onHand: number }[]>`
      SELECT ib.warehouse_id AS "warehouseId", w.code, SUM(ib.on_hand)::float8 AS "onHand"
      FROM inventory_balances ib
      JOIN component_brand_variants v ON v.id = ib.component_brand_variant_id
      JOIN warehouses w ON w.id = ib.warehouse_id
      WHERE v.component_id = ${comp.id}::uuid AND ib.deleted_at IS NULL
      GROUP BY ib.warehouse_id, w.code ORDER BY w.code`;

    const byVariant = await tx.$queryRaw<ComponentStockView["byVariant"]>`
      SELECT v.id AS "variantId", v.brand_id AS "brandId", b.slug AS "brandSlug", v.part_no AS "partNo",
             COALESCE(SUM(ib.on_hand),0)::float8 AS "onHand", COALESCE(SUM(ib.available),0)::float8 AS available
      FROM component_brand_variants v
      JOIN brands b ON b.id = v.brand_id
      LEFT JOIN inventory_balances ib ON ib.component_brand_variant_id = v.id AND ib.deleted_at IS NULL
      WHERE v.component_id = ${comp.id}::uuid AND v.deleted_at IS NULL
      GROUP BY v.id, v.brand_id, b.slug, v.part_no ORDER BY b.slug`;

    // Per-lot on-hand + value, derived from the ledger (FEFO order). Value uses the lot's unit_cost.
    const byLot = await tx.$queryRaw<ComponentStockView["byLot"]>`
      SELECT il.lot_no AS "lotNo", v.part_no AS "partNo", il.expiry_date::text AS "expiryDate",
             il.unit_cost::float8 AS "unitCost",
             SUM(t.qty_delta)::float8 AS "onHand",
             (SUM(t.qty_delta) * COALESCE(il.unit_cost, 0))::float8 AS "value"
      FROM item_lots il
      JOIN inventory_transactions t ON t.lot_id = il.id
      JOIN component_brand_variants v ON v.id = il.component_brand_variant_id
      WHERE v.component_id = ${comp.id}::uuid AND il.deleted_at IS NULL
      GROUP BY il.id, il.lot_no, v.part_no, il.expiry_date, il.unit_cost
      HAVING SUM(t.qty_delta) <> 0
      ORDER BY il.expiry_date NULLS LAST, il.lot_no`;

    return { componentId: comp.id, genericPN: comp.generic_pn, ...tot, byWarehouse, byVariant, byLot };
  });
}

// ── write path ───────────────────────────────────────────────────────────────

/** Resolve (or create) the lot for an inbound movement. Blank lotNo → auto-generated. */
async function resolveInboundLot(
  tx: TxClient,
  ctx: TenantContext,
  variantId: string,
  opts: { lotNo?: string; expiryDate?: string; unitCost?: number; supplierId?: string | null },
): Promise<string> {
  let lotNo = (opts.lotNo ?? "").trim();
  if (!lotNo) lotNo = `LOT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomUUID().slice(0, 4).toUpperCase()}`;
  const found = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM item_lots WHERE company_id = ${ctx.companyId!}::uuid
      AND component_brand_variant_id = ${variantId}::uuid AND lot_no = ${lotNo} AND deleted_at IS NULL LIMIT 1`;
  if (found[0]) return found[0].id;
  const ins = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO item_lots (company_id, component_brand_variant_id, lot_no, supplier_id, expiry_date, unit_cost, created_by, updated_by)
    VALUES (${ctx.companyId!}::uuid, ${variantId}::uuid, ${lotNo}, ${opts.supplierId ?? null}::uuid, ${opts.expiryDate ?? null}::date, ${opts.unitCost ?? null}, ${ctx.userId}::uuid, ${ctx.userId}::uuid)
    RETURNING id`;
  return ins[0].id;
}

/** FEFO lot pick for an outbound move: the lot with positive derived on-hand at
 *  this location, earliest expiry first (then oldest). null → trigger fallback. */
export async function pickOutboundLot(tx: TxClient, ctx: TenantContext, variantId: string, locationId: string): Promise<string | null> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT il.id
    FROM item_lots il
    JOIN inventory_transactions t ON t.lot_id = il.id
     AND t.component_brand_variant_id = ${variantId}::uuid AND t.location_id = ${locationId}::uuid
    WHERE il.company_id = ${ctx.companyId!}::uuid AND il.component_brand_variant_id = ${variantId}::uuid AND il.deleted_at IS NULL
    GROUP BY il.id, il.expiry_date, il.created_at
    HAVING SUM(t.qty_delta) > 0
    ORDER BY il.expiry_date NULLS LAST, il.created_at
    LIMIT 1`;
  return rows[0]?.id ?? null;
}

export async function createInventoryTransaction(input: InventoryTxnInput) {
  return guarded("inventory.create", async (tx, ctx) => {
    const variantId = input.variantId ?? (await resolveVariantByKeys(tx, input.genericPN!, input.brandSlug!));
    const variant = await tx.component_brand_variants.findFirst({ where: { id: variantId, deleted_at: null }, select: { id: true } });
    if (!variant) throw Errors.badRequest("Unknown variant", { variantId });

    const base = { company_id: ctx.companyId!, component_brand_variant_id: variantId, created_by: ctx.userId };
    const touched: { locationId: string }[] = [];

    if (input.type === "TRANSFER") {
      const fromWh = await warehouseForLocation(tx, input.fromLocationId!);
      const toWh = await warehouseForLocation(tx, input.toLocationId!);
      const qty = input.qty!;
      const avail = await availableAt(tx, variantId, input.fromLocationId!);
      if (avail < qty) throw Errors.conflict(
        "Insufficient available stock at source",
        { available: avail, requested: qty },
        `Only ${avail} available at the source location — reduce the transfer qty or transfer from a different location.`,
      );
      const group = randomUUID();
      await tx.inventory_transactions.create({ data: { ...base, type: "TRANSFER", warehouse_id: fromWh, location_id: input.fromLocationId!, qty_delta: -qty, transfer_group_id: group, note: input.note ?? null } });
      await tx.inventory_transactions.create({ data: { ...base, type: "TRANSFER", warehouse_id: toWh, location_id: input.toLocationId!, qty_delta: qty, transfer_group_id: group, note: input.note ?? null } });
      touched.push({ locationId: input.fromLocationId! }, { locationId: input.toLocationId! });
    } else if (input.type === "ADJUSTMENT") {
      const locationId = input.locationId ?? (await defaultLocation(tx));
      const wh = await warehouseForLocation(tx, locationId);
      const delta = input.qtyDelta!;
      if (delta < 0) {
        const avail = await availableAt(tx, variantId, locationId);
        if (avail < -delta) throw Errors.conflict(
          "Insufficient available stock",
          { available: avail, requested: -delta },
          `Only ${avail} available at this location — reduce the quantity or receive more stock first.`,
        );
      }
      await tx.inventory_transactions.create({ data: { ...base, type: "ADJUSTMENT", warehouse_id: wh, location_id: locationId, qty_delta: delta, reason: input.reason ?? null, note: input.note ?? null } });
      touched.push({ locationId });
    } else {
      const locationId = input.locationId ?? (await defaultLocation(tx));
      const wh = await warehouseForLocation(tx, locationId);
      const qty = input.qty!;
      const delta = POSITIVE_TYPES.has(input.type) ? qty : NEGATIVE_TYPES.has(input.type) ? -qty : qty;
      if (delta < 0) {
        const avail = await availableAt(tx, variantId, locationId);
        if (avail < -delta) throw Errors.conflict(
          "Insufficient available stock",
          { available: avail, requested: -delta },
          `Only ${avail} available at this location — reduce the quantity or receive more stock first.`,
        );
      }
      if (delta > 0) {
        // Inbound: capture (or auto-generate) a lot. lot_id must be set in the
        // INSERT because the ledger is append-only (no post-update allowed).
        let supplierId: string | null = null;
        if (input.supplierSlug) {
          const s = await tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM suppliers WHERE company_id = ${ctx.companyId!}::uuid AND slug = ${input.supplierSlug} AND deleted_at IS NULL LIMIT 1`;
          supplierId = s[0]?.id ?? null;
        }
        const lotId = await resolveInboundLot(tx, ctx, variantId, {
          lotNo: input.lotNo, expiryDate: input.expiryDate, unitCost: input.unitCost, supplierId,
        });
        await tx.$executeRaw`
          INSERT INTO inventory_transactions
            (company_id, type, component_brand_variant_id, warehouse_id, location_id, qty_delta, lot_id, ref_type, ref_id, grn_no, reason, note, created_by)
          VALUES (${ctx.companyId!}::uuid, ${input.type}::inventory_txn_type, ${variantId}::uuid, ${wh}::uuid, ${locationId}::uuid,
                  ${delta}, ${lotId}::uuid, ${input.refType ?? null}, ${input.refId ?? null}::uuid, ${input.grnNo ?? null},
                  ${input.reason ?? null}, ${input.note ?? null}, ${ctx.userId}::uuid)`;
      } else if (input.lotAllocations && input.lotAllocations.length > 0) {
        // Outbound MULTI-LOT: caller manually split across lots. Validate sum
        // matches qty and each lot has stock at the source location, then emit
        // one ledger row per allocation. Overrides `lotId`/FEFO.
        const total = input.lotAllocations.reduce((s, a) => s + a.qty, 0);
        if (Math.abs(total - input.qty!) > 1e-9) {
          throw Errors.badRequest(
            "Sum of lot allocations must equal the total qty",
            { requestedQty: input.qty, allocated: total },
            "Adjust the split so each lot's qty adds up to the total, or clear the split to use FEFO.",
          );
        }
        for (const alloc of input.lotAllocations) {
          const rows = await tx.$queryRaw<{ variantId: string; onHandAtLoc: number }[]>`
            SELECT il.component_brand_variant_id AS "variantId",
                   COALESCE((
                     SELECT SUM(t.qty_delta)::float8 FROM inventory_transactions t
                     WHERE t.lot_id = il.id AND t.location_id = ${locationId}::uuid
                   ), 0) AS "onHandAtLoc"
            FROM item_lots il
            WHERE il.id = ${alloc.lotId}::uuid AND il.deleted_at IS NULL
              AND il.company_id = ${ctx.companyId!}::uuid`;
          if (!rows[0]) throw Errors.notFound("Lot");
          if (rows[0].variantId !== variantId) {
            throw Errors.badRequest(
              "One of the picked lots belongs to a different variant",
              undefined,
              "Every allocated lot must belong to the same manufacturer variant.",
            );
          }
          if (rows[0].onHandAtLoc < alloc.qty) {
            throw Errors.conflict(
              "One of the picked lots has insufficient stock at this location",
              { lotId: alloc.lotId, available: rows[0].onHandAtLoc, requested: alloc.qty },
              `A lot in the split has only ${rows[0].onHandAtLoc} on-hand here — reduce that row or replace the lot.`,
            );
          }
        }
        for (const alloc of input.lotAllocations) {
          await tx.$executeRaw`
            INSERT INTO inventory_transactions
              (company_id, type, component_brand_variant_id, warehouse_id, location_id, qty_delta, lot_id, ref_type, ref_id, grn_no, reason, note, created_by)
            VALUES (${ctx.companyId!}::uuid, ${input.type}::inventory_txn_type, ${variantId}::uuid, ${wh}::uuid, ${locationId}::uuid,
                    ${-alloc.qty}, ${alloc.lotId}::uuid, ${input.refType ?? null}, ${input.refId ?? null}::uuid, ${input.grnNo ?? null},
                    ${input.reason ?? null}, ${input.note ?? null}, ${ctx.userId}::uuid)`;
        }
        touched.push({ locationId });
      } else {
        // Outbound SINGLE-LOT: if the caller pinned a lot, validate + use it;
        // otherwise FEFO (existing behaviour).
        let lotId: string | null;
        if (input.lotId) {
          const rows = await tx.$queryRaw<{ variantId: string; onHandAtLoc: number }[]>`
            SELECT il.component_brand_variant_id AS "variantId",
                   COALESCE((
                     SELECT SUM(t.qty_delta)::float8 FROM inventory_transactions t
                     WHERE t.lot_id = il.id AND t.location_id = ${locationId}::uuid
                   ), 0) AS "onHandAtLoc"
            FROM item_lots il
            WHERE il.id = ${input.lotId}::uuid AND il.deleted_at IS NULL
              AND il.company_id = ${ctx.companyId!}::uuid`;
          if (!rows[0]) throw Errors.notFound("Lot");
          if (rows[0].variantId !== variantId) {
            throw Errors.badRequest(
              "Selected lot belongs to a different variant of this item",
              undefined,
              "Pick a lot from the same manufacturer variant, or leave the lot on 'Auto (FEFO)'.",
            );
          }
          if (rows[0].onHandAtLoc < -delta) {
            throw Errors.conflict(
              "Selected lot has insufficient stock at this location",
              { available: rows[0].onHandAtLoc, requested: -delta },
              `Only ${rows[0].onHandAtLoc} available on this lot at this location — split the move across lots or reduce the qty.`,
            );
          }
          lotId = input.lotId;
        } else {
          lotId = await pickOutboundLot(tx, ctx, variantId, locationId);
        }
        await tx.$executeRaw`
          INSERT INTO inventory_transactions
            (company_id, type, component_brand_variant_id, warehouse_id, location_id, qty_delta, lot_id, ref_type, ref_id, grn_no, reason, note, created_by)
          VALUES (${ctx.companyId!}::uuid, ${input.type}::inventory_txn_type, ${variantId}::uuid, ${wh}::uuid, ${locationId}::uuid,
                  ${delta}, ${lotId}::uuid, ${input.refType ?? null}, ${input.refId ?? null}::uuid, ${input.grnNo ?? null},
                  ${input.reason ?? null}, ${input.note ?? null}, ${ctx.userId}::uuid)`;
        touched.push({ locationId });
      }
    }

    // return the affected balance rows (post-trigger projection)
    const locIds = [...new Set(touched.map((t) => t.locationId))];
    const balances = await tx.$queryRaw<BalanceView[]>(
      balanceSelect(Prisma.sql`AND ib.component_brand_variant_id = ${variantId}::uuid AND ib.location_id IN (${Prisma.join(locIds.map((id) => Prisma.sql`${id}::uuid`))})`),
    );
    return { ok: true, type: input.type, balances };
  });
}
