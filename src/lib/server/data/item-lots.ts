/**
 * Item lots (Postgres) — traceable batches of a brand variant. Accessed via raw
 * SQL because `item_lots` is a post-baseline table not present in the generated
 * Prisma client (same convention as item_categories / preferred_supplier_id).
 *
 * A lot's on-hand + value is DERIVED from the ledger (inventory_transactions.lot_id),
 * never stored — mirrors getComponentStock().byLot in inventory.ts. Lots are created
 * on receipt (see resolveInboundLot / the assign_default_lot trigger); these functions
 * cover read / correct / remove. Guarded by the inventory perms (batch config).
 */
import { Prisma } from "@/generated/prisma/client";
import { withTenant, type TenantContext, type TxClient } from "@/lib/prisma";
import { Errors } from "@/lib/server/http";
import { assertPermission } from "@/lib/server/rbac";
import { requireSession } from "@/lib/server/session";
import { isUuid } from "@/lib/server/data/util";

export interface LotView {
  id: string;
  variantId: string;
  componentId: string;
  genericPN: string;
  componentName: string;
  brandId: string;
  brandSlug: string;
  partNo: string | null;
  lotNo: string;
  supplierId: string | null;
  supplierSlug: string | null;
  supplierName: string | null;
  receivedDate: string | null;
  mfgDate: string | null;
  expiryDate: string | null;
  unitCost: number | null;
  dateCode: string | null;
  msl: string | null;
  note: string | null;
  /** Derived from the ledger: sum of qty_delta over this lot. */
  onHand: number;
  /** onHand * unit_cost (0 when cost unset). */
  value: number;
}

export interface LotFilters {
  variantId?: string;
  /** Component uuid OR generic_pn (the client model keys items by generic_pn). */
  componentId?: string;
  /**
   * When set (e.g. 30), returns only lots with a non-null expiry within `N` days
   * from today AND positive on-hand. Includes already-expired lots (negative
   * days-until-expiry) so the same query drives "expiring soon" + "expired" reports.
   */
  expiringWithinDays?: number;
}

async function guarded<T>(perm: string, fn: (tx: TxClient, ctx: TenantContext) => Promise<T>): Promise<T> {
  const ctx = await requireSession();
  return withTenant(ctx, async (tx) => {
    await assertPermission(tx, ctx, perm);
    return fn(tx, ctx);
  });
}

/** The full lot view row, filtered by `where` (empty selects all live lots). */
function lotSelect(where: Prisma.Sql) {
  return Prisma.sql`
    SELECT il.id, il.component_brand_variant_id AS "variantId",
      v.component_id AS "componentId", c.generic_pn AS "genericPN", c.name AS "componentName",
      v.brand_id AS "brandId", b.slug AS "brandSlug", v.part_no AS "partNo",
      il.lot_no AS "lotNo",
      il.supplier_id AS "supplierId", sup.slug AS "supplierSlug", sup.name AS "supplierName",
      il.received_date::text AS "receivedDate", il.mfg_date::text AS "mfgDate",
      il.expiry_date::text AS "expiryDate", il.unit_cost::float8 AS "unitCost",
      il.date_code AS "dateCode", il.msl, il.note,
      COALESCE((SELECT SUM(t.qty_delta) FROM inventory_transactions t WHERE t.lot_id = il.id), 0)::float8 AS "onHand",
      (COALESCE((SELECT SUM(t.qty_delta) FROM inventory_transactions t WHERE t.lot_id = il.id), 0)
        * COALESCE(il.unit_cost, 0))::float8 AS "value"
    FROM item_lots il
    JOIN component_brand_variants v ON v.id = il.component_brand_variant_id
    JOIN components c ON c.id = v.component_id
    JOIN brands b ON b.id = v.brand_id
    LEFT JOIN suppliers sup ON sup.id = il.supplier_id
    WHERE il.deleted_at IS NULL ${where}
    ORDER BY il.expiry_date NULLS LAST, il.lot_no`;
}

// ── reads ────────────────────────────────────────────────────────────────────
export async function listLots(f: LotFilters): Promise<LotView[]> {
  return guarded("inventory.view", async (tx) => {
    const cond: Prisma.Sql[] = [];
    if (f.variantId && isUuid(f.variantId)) cond.push(Prisma.sql`AND il.component_brand_variant_id = ${f.variantId}::uuid`);
    if (f.componentId) cond.push(Prisma.sql`AND (v.component_id::text = ${f.componentId} OR c.generic_pn = ${f.componentId})`);
    if (f.expiringWithinDays != null) {
      // Only lots with an expiry set + positive on-hand. Negative days
      // (already expired) are included so the filter also surfaces expired lots.
      const days = Math.max(0, Math.round(f.expiringWithinDays));
      cond.push(Prisma.sql`
        AND il.expiry_date IS NOT NULL
        AND il.expiry_date <= (CURRENT_DATE + ${days} * INTERVAL '1 day')
        AND (SELECT COALESCE(SUM(t.qty_delta), 0) FROM inventory_transactions t WHERE t.lot_id = il.id) > 0`);
    }
    return tx.$queryRaw<LotView[]>(lotSelect(cond.length ? Prisma.join(cond, " ") : Prisma.empty));
  });
}

export async function getLot(id: string): Promise<LotView> {
  return guarded("inventory.view", async (tx) => {
    if (!isUuid(id)) throw Errors.notFound("Lot");
    const rows = await tx.$queryRaw<LotView[]>(lotSelect(Prisma.sql`AND il.id = ${id}::uuid`));
    if (!rows[0]) throw Errors.notFound("Lot");
    return rows[0];
  });
}

// ── update ─────────────────────────────────────────────────────────────────
export interface UpdateLotInput {
  lotNo?: string;
  /** Supplier uuid / slug / name; "" or null clears it. */
  supplier?: string | null;
  receivedDate?: string | null;
  mfgDate?: string | null;
  expiryDate?: string | null;
  unitCost?: number | null;
  dateCode?: string | null;
  msl?: string | null;
  note?: string | null;
}

/** Correct a lot's metadata (lot no, dates, cost, supplier, MSL, date-code). */
export async function updateLot(id: string, patch: UpdateLotInput): Promise<LotView> {
  return guarded("inventory.edit", async (tx, ctx) => {
    if (!isUuid(id)) throw Errors.notFound("Lot");
    const existing = await tx.$queryRaw<{ id: string; variantId: string; lotNo: string }[]>`
      SELECT id, component_brand_variant_id AS "variantId", lot_no AS "lotNo"
      FROM item_lots WHERE id = ${id}::uuid AND deleted_at IS NULL`;
    if (!existing[0]) throw Errors.notFound("Lot");

    // Renaming the lot must keep (variant, lot_no) unique among live lots.
    if (patch.lotNo !== undefined) {
      const lotNo = patch.lotNo.trim();
      if (!lotNo) throw Errors.badRequest("Lot number cannot be empty");
      if (lotNo !== existing[0].lotNo) {
        const dupe = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM item_lots
          WHERE company_id = ${ctx.companyId!}::uuid AND component_brand_variant_id = ${existing[0].variantId}::uuid
            AND lot_no = ${lotNo} AND deleted_at IS NULL AND id <> ${id}::uuid LIMIT 1`;
        if (dupe[0]) throw Errors.conflict("A lot with this number already exists for this item", { lotNo });
      }
    }

    // Resolve supplier (uuid / slug / name) → uuid, or null to clear.
    let supplierId: string | null | undefined;
    if (patch.supplier !== undefined) {
      if (patch.supplier === null || patch.supplier.trim() === "") {
        supplierId = null;
      } else {
        const key = patch.supplier.trim();
        const sup = await tx.suppliers.findFirst({
          where: { deleted_at: null, ...(isUuid(key) ? { id: key } : { OR: [{ slug: key }, { name: { equals: key, mode: "insensitive" } }] }) },
          select: { id: true },
        });
        if (!sup) throw Errors.notFound("Supplier");
        supplierId = sup.id;
      }
    }

    const set: Prisma.Sql[] = [Prisma.sql`updated_by = ${ctx.userId}::uuid`, Prisma.sql`updated_at = now()`];
    if (patch.lotNo !== undefined) set.push(Prisma.sql`lot_no = ${patch.lotNo.trim()}`);
    if (supplierId !== undefined) set.push(Prisma.sql`supplier_id = ${supplierId}::uuid`);
    if (patch.receivedDate !== undefined) set.push(Prisma.sql`received_date = ${patch.receivedDate}::date`);
    if (patch.mfgDate !== undefined) set.push(Prisma.sql`mfg_date = ${patch.mfgDate}::date`);
    if (patch.expiryDate !== undefined) set.push(Prisma.sql`expiry_date = ${patch.expiryDate}::date`);
    if (patch.unitCost !== undefined) set.push(Prisma.sql`unit_cost = ${patch.unitCost}`);
    if (patch.dateCode !== undefined) set.push(Prisma.sql`date_code = ${patch.dateCode?.trim() || null}`);
    if (patch.msl !== undefined) set.push(Prisma.sql`msl = ${patch.msl?.trim() || null}`);
    if (patch.note !== undefined) set.push(Prisma.sql`note = ${patch.note?.trim() || null}`);

    await tx.$executeRaw(Prisma.sql`UPDATE item_lots SET ${Prisma.join(set, ", ")} WHERE id = ${id}::uuid`);
    return getLotIn(tx, id);
  });
}

// ── delete ─────────────────────────────────────────────────────────────────
/** Soft-delete a lot. Blocked if any ledger movement references it (traceability). */
export async function deleteLot(id: string): Promise<{ id: string; lotNo: string }> {
  return guarded("inventory.edit", async (tx, ctx) => {
    if (!isUuid(id)) throw Errors.notFound("Lot");
    const existing = await tx.$queryRaw<{ id: string; lotNo: string }[]>`
      SELECT id, lot_no AS "lotNo" FROM item_lots WHERE id = ${id}::uuid AND deleted_at IS NULL`;
    if (!existing[0]) throw Errors.notFound("Lot");

    const inUse = await tx.$queryRaw<{ one: number }[]>`
      SELECT 1 AS one FROM inventory_transactions WHERE lot_id = ${id}::uuid LIMIT 1`;
    if (inUse.length) throw Errors.conflict(
      "Lot has stock movements and cannot be deleted",
      undefined,
      "Stock out or transfer everything from this lot first — a lot with any ledger movement cannot be soft-deleted.",
    );

    await tx.$executeRaw`
      UPDATE item_lots SET deleted_at = now(), updated_by = ${ctx.userId}::uuid WHERE id = ${id}::uuid`;
    return { id: existing[0].id, lotNo: existing[0].lotNo };
  });
}

/** Re-read a lot view inside an existing tx (used after mutations). */
async function getLotIn(tx: TxClient, id: string): Promise<LotView> {
  const rows = await tx.$queryRaw<LotView[]>(lotSelect(Prisma.sql`AND il.id = ${id}::uuid`));
  if (!rows[0]) throw Errors.notFound("Lot");
  return rows[0];
}
