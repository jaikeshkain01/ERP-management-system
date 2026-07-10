/**
 * Components data access — the single place the `isTesting` toggle branches for
 * this resource. Route handlers call these functions and never care about the
 * source: mock mode reads `src/mockdata`, real mode queries Postgres (with auth,
 * RLS tenant context, and the permission gate).
 *
 * Stock fields are DERIVED, never stored: DB mode rolls up `inventory_balances`
 * over the component's brand variants; mock mode uses the mockdata derived stock.
 */
import { Prisma } from "@/generated/prisma/client";
import { isTesting } from "@/lib/config";
import { withTenant, type TenantContext, type TxClient } from "@/lib/prisma";
import { ApiError, Errors } from "@/lib/server/http";
import { assertPermission } from "@/lib/server/rbac";
import { requireSession } from "@/lib/server/session";
import { isUuid } from "@/lib/server/data/util";
import { COMPONENTS } from "@/mockdata/components";

export interface ComponentFilters {
  category?: string;
  solderType?: "SMD" | "DIP";
  footprint?: string;
  q?: string;
}

export type StockStatus = "Healthy" | "Low" | "Critical";

/** The camelCase view returned to the client (matches src/mockdata/types.ts). */
export interface ComponentView {
  id: string;
  genericPN: string;
  name: string;
  category: string | null;
  description: string | null;
  unit: string;
  solderType: string | null;
  footprint: string | null;
  spq: number | null;
  minStock: number;
  reorderQty: number;
  annualConsumption: number;
  specs: unknown;
  /** Derived from inventory (on-hand = available + reserved). */
  stock: number;
  available: number;
  reserved: number;
  stockStatus: StockStatus;
}

interface StockAgg {
  onHand: number;
  available: number;
  reserved: number;
}

/** Healthy / Low / Critical from stock vs min-stock (mirrors mockdata selector). */
function statusOf(stock: number, minStock: number): StockStatus {
  if (stock <= minStock * 0.5) return "Critical";
  if (stock < minStock) return "Low";
  return "Healthy";
}

export async function listComponents(filters: ComponentFilters): Promise<ComponentView[]> {
  if (isTesting) return listComponentsMock(filters);

  const ctx = await requireSession();
  return withTenant(ctx, async (tx) => {
    await assertPermission(tx, ctx, "component.view");
    const rows = await tx.components.findMany({ where: buildWhere(filters), orderBy: { name: "asc" } });

    // Roll up inventory balances per component in one query, then merge.
    const stockByComponent = new Map<string, StockAgg>();
    if (rows.length) {
      const agg = await tx.$queryRaw<(StockAgg & { componentId: string })[]>`
        SELECT v.component_id AS "componentId",
          COALESCE(SUM(ib.on_hand), 0)::float8 AS "onHand",
          COALESCE(SUM(ib.available), 0)::float8 AS available,
          COALESCE(SUM(ib.reserved), 0)::float8 AS reserved
        FROM component_brand_variants v
        LEFT JOIN inventory_balances ib ON ib.component_brand_variant_id = v.id AND ib.deleted_at IS NULL
        WHERE v.deleted_at IS NULL
          AND v.component_id IN (${Prisma.join(rows.map((r) => Prisma.sql`${r.id}::uuid`))})
        GROUP BY v.component_id`;
      for (const a of agg) stockByComponent.set(a.componentId, a);
    }

    return rows.map((r) => fromDb(r, stockByComponent.get(r.id)));
  });
}

// ── create (POST /components) ──────────────────────────────────────────────────

export interface CreateComponentVariantInput {
  brand: string; // brand name (resolved to a brand, created if new)
  partNo: string;
  stock?: number; // opening stock (seeded as an IN ledger row)
}

export interface CreateComponentInput {
  genericPN: string;
  name: string;
  category?: string;
  description?: string;
  unit?: string;
  solderType?: "SMD" | "DIP";
  footprint?: string;
  spq?: number;
  minStock?: number;
  reorderQty?: number; // the form's MOQ maps here
  specs?: { key: string; value: string }[];
  variants?: CreateComponentVariantInput[];
}

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

async function guarded<T>(perm: string, fn: (tx: TxClient, ctx: TenantContext) => Promise<T>): Promise<T> {
  const ctx = await requireSession();
  return withTenant(ctx, async (tx) => {
    await assertPermission(tx, ctx, perm);
    return fn(tx, ctx);
  });
}

/** Resolve a brand by name (case-insensitive), creating one if it doesn't exist. */
async function resolveOrCreateBrand(tx: TxClient, ctx: TenantContext, name: string): Promise<string> {
  const existing = await tx.brands.findFirst({
    where: { deleted_at: null, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await tx.brands.create({
    data: {
      company_id: ctx.companyId, created_by: ctx.userId, updated_by: ctx.userId,
      slug: slugify(name), name, status: "Approved",
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * Create a component with its brand variants (and optional opening stock, seeded as
 * IN ledger rows into the default bin). Brands are resolved by name / created on the fly.
 */
export async function createComponent(input: CreateComponentInput): Promise<ComponentView> {
  if (isTesting) {
    throw new ApiError(400, "mock_read_only", "Component writes are not available in mock mode (isTesting=true).");
  }
  return guarded("component.create", async (tx, ctx) => {
    const genericPN = input.genericPN.trim();
    const dupe = await tx.components.findFirst({ where: { generic_pn: genericPN, deleted_at: null }, select: { id: true } });
    if (dupe) throw Errors.conflict("A component with this generic part number already exists", { genericPN });

    const audit = { company_id: ctx.companyId, created_by: ctx.userId, updated_by: ctx.userId };
    const minStock = input.minStock ?? 0;
    const specs = (input.specs ?? []).filter((s) => s.key.trim());

    const comp = await tx.components.create({
      data: {
        ...audit,
        generic_pn: genericPN,
        name: input.name.trim(),
        category: input.category ?? null,
        description: input.description ?? null,
        unit: input.unit ?? "PCS",
        solder_type: input.solderType ?? null,
        footprint: input.footprint ?? null,
        spq: input.spq ?? null,
        min_stock: minStock,
        reorder_qty: input.reorderQty ?? 0,
        annual_consumption: 0,
        specs,
      },
      select: { id: true },
    });

    // Brand variants + opening stock.
    const variants = (input.variants ?? []).filter((v) => v.brand.trim() && v.partNo.trim());
    const openingRows = variants.filter((v) => (v.stock ?? 0) > 0);

    let bin: { id: string; warehouse_id: string } | null = null;
    if (openingRows.length) {
      await assertPermission(tx, ctx, "inventory.create"); // opening stock writes the ledger
      bin = await tx.storage_locations.findFirst({
        where: { kind: "bin", is_default: true, deleted_at: null },
        select: { id: true, warehouse_id: true },
      });
      if (!bin) throw Errors.conflict("No default bin configured for opening stock");
    }

    let onHand = 0;
    for (const v of variants) {
      const brandId = await resolveOrCreateBrand(tx, ctx, v.brand.trim());
      const variant = await tx.component_brand_variants.create({
        data: { ...audit, component_id: comp.id, brand_id: brandId, part_no: v.partNo.trim() },
        select: { id: true },
      });
      const qty = v.stock ?? 0;
      if (qty > 0 && bin) {
        await tx.inventory_transactions.create({
          data: {
            company_id: ctx.companyId, type: "IN",
            component_brand_variant_id: variant.id,
            warehouse_id: bin.warehouse_id, location_id: bin.id,
            qty_delta: qty, ref_type: "opening", reason: `Opening stock for ${genericPN}`,
            created_by: ctx.userId,
          },
        });
        onHand += qty;
      }
    }

    return {
      id: comp.id, genericPN, name: input.name.trim(), category: input.category ?? null,
      description: input.description ?? null, unit: input.unit ?? "PCS",
      solderType: input.solderType ?? null, footprint: input.footprint ?? null, spq: input.spq ?? null,
      minStock, reorderQty: input.reorderQty ?? 0, annualConsumption: 0, specs,
      stock: onHand, available: onHand, reserved: 0, stockStatus: statusOf(onHand, minStock),
    };
  });
}

// ── edit component / add variant ────────────────────────────────────────────────

/** Roll up on-hand/available/reserved for a single component (across its variants). */
async function componentStock(tx: TxClient, componentId: string): Promise<StockAgg> {
  const rows = await tx.$queryRaw<StockAgg[]>`
    SELECT COALESCE(SUM(ib.on_hand), 0)::float8 AS "onHand",
           COALESCE(SUM(ib.available), 0)::float8 AS available,
           COALESCE(SUM(ib.reserved), 0)::float8 AS reserved
    FROM component_brand_variants v
    LEFT JOIN inventory_balances ib ON ib.component_brand_variant_id = v.id AND ib.deleted_at IS NULL
    WHERE v.deleted_at IS NULL AND v.component_id = ${componentId}::uuid`;
  return rows[0] ?? { onHand: 0, available: 0, reserved: 0 };
}

export interface UpdateComponentInput {
  genericPN?: string;
  name?: string;
  category?: string | null;
  description?: string | null;
  unit?: string;
  solderType?: "SMD" | "DIP" | null;
  footprint?: string | null;
  spq?: number | null;
  minStock?: number;
  reorderQty?: number;
  specs?: { key: string; value: string }[];
}

/** Edit a component's own fields (by uuid or generic_pn). Changing generic_pn is allowed but must stay unique. */
export async function updateComponent(idOrSlug: string, patch: UpdateComponentInput): Promise<ComponentView> {
  if (isTesting) throw new ApiError(400, "mock_read_only", "Component writes are not available in mock mode (isTesting=true).");
  return guarded("component.edit", async (tx, ctx) => {
    const existing = await tx.components.findFirst({
      where: { deleted_at: null, ...(isUuid(idOrSlug) ? { id: idOrSlug } : { generic_pn: idOrSlug }) },
      select: { id: true, generic_pn: true },
    });
    if (!existing) throw Errors.notFound("Component");

    if (patch.genericPN !== undefined && patch.genericPN.trim() !== existing.generic_pn) {
      const dupe = await tx.components.findFirst({
        where: { generic_pn: patch.genericPN.trim(), deleted_at: null, NOT: { id: existing.id } },
        select: { id: true },
      });
      if (dupe) throw Errors.conflict("A component with this generic part number already exists", { genericPN: patch.genericPN.trim() });
    }

    const row = await tx.components.update({
      where: { id: existing.id },
      data: {
        updated_by: ctx.userId,
        updated_at: new Date(),
        ...(patch.genericPN !== undefined ? { generic_pn: patch.genericPN.trim() } : {}),
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.category !== undefined ? { category: patch.category?.trim() || null } : {}),
        ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
        ...(patch.unit !== undefined ? { unit: patch.unit } : {}),
        ...(patch.solderType !== undefined ? { solder_type: patch.solderType } : {}),
        ...(patch.footprint !== undefined ? { footprint: patch.footprint?.trim() || null } : {}),
        ...(patch.spq !== undefined ? { spq: patch.spq } : {}),
        ...(patch.minStock !== undefined ? { min_stock: patch.minStock } : {}),
        ...(patch.reorderQty !== undefined ? { reorder_qty: patch.reorderQty } : {}),
        ...(patch.specs !== undefined ? { specs: patch.specs.filter((s) => s.key.trim()) } : {}),
      },
    });

    return fromDb(row, await componentStock(tx, existing.id));
  });
}

export interface AddVariantInput {
  brand: string; // brand name (resolved / created)
  partNo: string;
  stock?: number; // opening stock → IN ledger row
}

export interface VariantView {
  componentId: string; // generic_pn
  brandId: string; // slug
  brandName: string;
  partNo: string;
  stock: number;
}

/** Add a brand variant to a component (Link Component / Add Variant forms). Optional opening stock. */
export async function addComponentVariant(idOrSlug: string, input: AddVariantInput): Promise<VariantView> {
  if (isTesting) throw new ApiError(400, "mock_read_only", "Component writes are not available in mock mode (isTesting=true).");
  return guarded("component.edit", async (tx, ctx) => {
    const comp = await tx.components.findFirst({
      where: { deleted_at: null, ...(isUuid(idOrSlug) ? { id: idOrSlug } : { generic_pn: idOrSlug }) },
      select: { id: true, generic_pn: true },
    });
    if (!comp) throw Errors.notFound("Component");

    const brandId = await resolveOrCreateBrand(tx, ctx, input.brand.trim());
    const dupe = await tx.component_brand_variants.findFirst({
      where: { component_id: comp.id, brand_id: brandId, deleted_at: null },
      select: { id: true },
    });
    if (dupe) throw Errors.conflict("This brand already has a variant for this component");

    const audit = { company_id: ctx.companyId, created_by: ctx.userId, updated_by: ctx.userId };
    const variant = await tx.component_brand_variants.create({
      data: { ...audit, component_id: comp.id, brand_id: brandId, part_no: input.partNo.trim() },
      select: { id: true },
    });

    const qty = input.stock ?? 0;
    if (qty > 0) {
      await assertPermission(tx, ctx, "inventory.create"); // opening stock writes the ledger
      const bin = await tx.storage_locations.findFirst({
        where: { kind: "bin", is_default: true, deleted_at: null },
        select: { id: true, warehouse_id: true },
      });
      if (!bin) throw Errors.conflict("No default bin configured for opening stock");
      await tx.inventory_transactions.create({
        data: {
          company_id: ctx.companyId, type: "IN",
          component_brand_variant_id: variant.id,
          warehouse_id: bin.warehouse_id, location_id: bin.id,
          qty_delta: qty, ref_type: "opening", reason: `Opening stock for ${comp.generic_pn}`,
          created_by: ctx.userId,
        },
      });
    }

    const brand = await tx.brands.findUnique({ where: { id: brandId }, select: { slug: true, name: true } });
    return {
      componentId: comp.generic_pn,
      brandId: brand?.slug ?? brandId,
      brandName: brand?.name ?? input.brand.trim(),
      partNo: input.partNo.trim(),
      stock: qty,
    };
  });
}

/** Soft-delete a component (by uuid or generic_pn). Blocked if it is used in any PCB BOM. */
export async function deleteComponent(idOrSlug: string): Promise<{ id: string; genericPN: string }> {
  if (isTesting) throw new ApiError(400, "mock_read_only", "Component writes are not available in mock mode (isTesting=true).");
  return guarded("component.delete", async (tx, ctx) => {
    const comp = await tx.components.findFirst({
      where: { deleted_at: null, ...(isUuid(idOrSlug) ? { id: idOrSlug } : { generic_pn: idOrSlug }) },
      select: { id: true, generic_pn: true },
    });
    if (!comp) throw Errors.notFound("Component");

    const inUse = await tx.pcb_lines.findFirst({
      where: { component_id: comp.id, deleted_at: null },
      select: { id: true },
    });
    if (inUse) throw Errors.conflict("Component is used in one or more PCB BOMs and cannot be deleted");

    await tx.components.update({
      where: { id: comp.id },
      data: { deleted_at: new Date(), updated_by: ctx.userId },
    });
    return { id: comp.id, genericPN: comp.generic_pn };
  });
}

// ── DB source ────────────────────────────────────────────────────────────────

function buildWhere(f: ComponentFilters): Prisma.componentsWhereInput {
  return {
    deleted_at: null,
    ...(f.category ? { category: f.category } : {}),
    ...(f.solderType ? { solder_type: f.solderType } : {}),
    ...(f.footprint ? { footprint: f.footprint } : {}),
    ...(f.q
      ? {
          OR: [
            { generic_pn: { contains: f.q, mode: "insensitive" } },
            { name: { contains: f.q, mode: "insensitive" } },
            { description: { contains: f.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

function fromDb(
  c: {
    id: string;
    generic_pn: string;
    name: string;
    category: string | null;
    description: string | null;
    unit: string;
    solder_type: string | null;
    footprint: string | null;
    spq: number | null;
    min_stock: unknown;
    reorder_qty: unknown;
    annual_consumption: unknown;
    specs: unknown;
  },
  agg?: StockAgg,
): ComponentView {
  const minStock = Number(c.min_stock);
  const stock = agg?.onHand ?? 0;
  return {
    id: c.id,
    genericPN: c.generic_pn,
    name: c.name,
    category: c.category,
    description: c.description,
    unit: c.unit,
    solderType: c.solder_type,
    footprint: c.footprint,
    spq: c.spq,
    minStock,
    reorderQty: Number(c.reorder_qty),
    annualConsumption: Number(c.annual_consumption),
    specs: c.specs,
    stock,
    available: agg?.available ?? 0,
    reserved: agg?.reserved ?? 0,
    stockStatus: statusOf(stock, minStock),
  };
}

// ── Mock source ──────────────────────────────────────────────────────────────

function listComponentsMock(f: ComponentFilters): ComponentView[] {
  const q = f.q?.toLowerCase();
  return COMPONENTS.filter((c) => {
    if (f.category && c.category !== f.category) return false;
    if (f.solderType && c.solderType !== f.solderType) return false;
    if (f.footprint && c.footprint !== f.footprint) return false;
    if (q) {
      const hay = `${c.genericPN} ${c.name} ${c.description}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  })
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({
      id: c.id,
      genericPN: c.genericPN,
      name: c.name,
      category: c.category,
      description: c.description,
      unit: c.unit,
      solderType: c.solderType,
      footprint: c.footprint,
      spq: c.spq,
      minStock: c.minStock,
      reorderQty: c.reorderQty,
      annualConsumption: c.annualConsumption,
      specs: c.specs,
      stock: c.stock,
      available: c.stock, // no reservations in the mock
      reserved: 0,
      stockStatus: statusOf(c.stock, c.minStock),
    }));
}
