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
        it.reason, it.note, it.created_at AS "createdAt"
      FROM inventory_transactions it
      JOIN component_brand_variants v ON v.id = it.component_brand_variant_id
      JOIN components c ON c.id = v.component_id
      JOIN brands b ON b.id = v.brand_id
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

    return { componentId: comp.id, genericPN: comp.generic_pn, ...tot, byWarehouse, byVariant };
  });
}

// ── write path ───────────────────────────────────────────────────────────────
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
      if (avail < qty) throw Errors.conflict("Insufficient available stock at source", { available: avail, requested: qty });
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
        if (avail < -delta) throw Errors.conflict("Insufficient available stock", { available: avail, requested: -delta });
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
        if (avail < -delta) throw Errors.conflict("Insufficient available stock", { available: avail, requested: -delta });
      }
      await tx.inventory_transactions.create({
        data: {
          ...base, type: input.type, warehouse_id: wh, location_id: locationId, qty_delta: delta,
          ref_type: input.refType ?? null, ref_id: input.refId ?? null, grn_no: input.grnNo ?? null,
          reason: input.reason ?? null, note: input.note ?? null,
        },
      });
      touched.push({ locationId });
    }

    // return the affected balance rows (post-trigger projection)
    const locIds = [...new Set(touched.map((t) => t.locationId))];
    const balances = await tx.$queryRaw<BalanceView[]>(
      balanceSelect(Prisma.sql`AND ib.component_brand_variant_id = ${variantId}::uuid AND ib.location_id IN (${Prisma.join(locIds.map((id) => Prisma.sql`${id}::uuid`))})`),
    );
    return { ok: true, type: input.type, balances };
  });
}
