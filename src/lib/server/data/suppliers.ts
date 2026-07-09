/**
 * Suppliers data access (mock/DB). Endpoints: list, detail, and the supplier's
 * current price book (supplier_component_prices with valid_to IS NULL).
 */
import { isTesting } from "@/lib/config";
import { withTenant, type TenantContext, type TxClient } from "@/lib/prisma";
import { ApiError, Errors } from "@/lib/server/http";
import { assertPermission } from "@/lib/server/rbac";
import { requireSession } from "@/lib/server/session";
import { isUuid } from "@/lib/server/data/util";
import { SUPPLIERS, COMPONENTS, getSupplier, getBrandName } from "@/mockdata";

export interface SupplierView {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  contact: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  terms: string | null;
  rating: number | null;
  status: string;
}

export interface SupplierPriceView {
  componentId: string;
  genericPN: string;
  componentName: string;
  brandId: string;
  brandName: string;
  price: number;
  currency: string;
  leadTimeDays: number | null;
}

async function guarded<T>(perm: string, fn: (tx: TxClient, ctx: TenantContext) => Promise<T>): Promise<T> {
  const ctx = await requireSession();
  return withTenant(ctx, async (tx) => {
    await assertPermission(tx, ctx, perm);
    return fn(tx, ctx);
  });
}

export async function listSuppliers(): Promise<SupplierView[]> {
  if (isTesting) return SUPPLIERS.map(mockSupplier).sort((a, b) => a.name.localeCompare(b.name));
  return guarded("supplier.view", async (tx) => {
    const rows = await tx.suppliers.findMany({ where: { deleted_at: null }, orderBy: { name: "asc" } });
    return rows.map(fromDb);
  });
}

export async function getSupplierDetail(idOrSlug: string): Promise<SupplierView> {
  if (isTesting) {
    const s = getSupplier(idOrSlug);
    if (!s) throw Errors.notFound("Supplier");
    return mockSupplier(s);
  }
  return guarded("supplier.view", async (tx) => {
    const row = await tx.suppliers.findFirst({
      where: { deleted_at: null, ...(isUuid(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug }) },
    });
    if (!row) throw Errors.notFound("Supplier");
    return fromDb(row);
  });
}

export async function getSupplierPrices(idOrSlug: string): Promise<SupplierPriceView[]> {
  if (isTesting) {
    const s = getSupplier(idOrSlug);
    if (!s) throw Errors.notFound("Supplier");
    const out: SupplierPriceView[] = [];
    for (const c of COMPONENTS) {
      for (const o of c.offers) {
        if (o.supplierId !== s.id) continue;
        out.push({
          componentId: c.id, genericPN: c.genericPN, componentName: c.name,
          brandId: o.brandId, brandName: getBrandName(o.brandId),
          price: o.price, currency: "INR", leadTimeDays: o.leadTimeDays,
        });
      }
    }
    return out.sort((a, b) => a.componentName.localeCompare(b.componentName));
  }
  return guarded("supplier.view", async (tx) => {
    const supplier = await tx.suppliers.findFirst({
      where: { deleted_at: null, ...(isUuid(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug }) },
      select: { id: true },
    });
    if (!supplier) throw Errors.notFound("Supplier");
    return tx.$queryRaw<SupplierPriceView[]>`
      SELECT c.id AS "componentId", c.generic_pn AS "genericPN", c.name AS "componentName",
             b.id AS "brandId", b.name AS "brandName",
             scp.price::float8 AS price, scp.currency, scp.lead_time_days AS "leadTimeDays"
      FROM supplier_component_prices scp
      JOIN components c ON c.id = scp.component_id AND c.deleted_at IS NULL
      JOIN brands b ON b.id = scp.brand_id AND b.deleted_at IS NULL
      WHERE scp.supplier_id = ${supplier.id}::uuid AND scp.valid_to IS NULL AND scp.deleted_at IS NULL
      ORDER BY c.name`;
  });
}

// ── writes (edit supplier / upsert price) ───────────────────────────────────────
export interface UpdateSupplierInput {
  name?: string;
  description?: string | null;
  contact?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  terms?: string | null;
  rating?: number | null;
  status?: "Active" | "Inactive";
}

/** Edit a supplier's own fields (by uuid or slug). slug is immutable. */
export async function updateSupplier(idOrSlug: string, patch: UpdateSupplierInput): Promise<SupplierView> {
  if (isTesting) throw new ApiError(400, "mock_read_only", "Supplier writes are not available in mock mode (isTesting=true).");
  return guarded("supplier.edit", async (tx, ctx) => {
    const existing = await tx.suppliers.findFirst({
      where: { deleted_at: null, ...(isUuid(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug }) },
      select: { id: true },
    });
    if (!existing) throw Errors.notFound("Supplier");
    const row = await tx.suppliers.update({
      where: { id: existing.id },
      data: {
        updated_by: ctx.userId,
        updated_at: new Date(),
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
        ...(patch.contact !== undefined ? { contact: patch.contact?.trim() || null } : {}),
        ...(patch.email !== undefined ? { email: patch.email?.trim() || null } : {}),
        ...(patch.phone !== undefined ? { phone: patch.phone?.trim() || null } : {}),
        ...(patch.address !== undefined ? { address: patch.address?.trim() || null } : {}),
        ...(patch.terms !== undefined ? { terms: patch.terms?.trim() || null } : {}),
        ...(patch.rating !== undefined ? { rating: patch.rating } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
      },
    });
    return fromDb(row);
  });
}

export interface UpsertSupplierPriceInput {
  component: string; // uuid or generic_pn
  brand: string; // uuid or slug
  price: number;
  currency?: string;
  moq?: number;
  spq?: number;
  leadTimeDays?: number;
}

/**
 * Set the CURRENT price a supplier charges for a (component, brand) — the price book
 * (§7c). Updates the open row (valid_to IS NULL) in place if one exists, else inserts
 * a new current row. Used by the "Map Component" / "Add / Edit Supplier" price forms.
 */
export async function upsertSupplierPrice(idOrSlug: string, input: UpsertSupplierPriceInput): Promise<SupplierPriceView> {
  if (isTesting) throw new ApiError(400, "mock_read_only", "Supplier price writes are not available in mock mode (isTesting=true).");
  return guarded("supplier.edit", async (tx, ctx) => {
    const supplier = await tx.suppliers.findFirst({
      where: { deleted_at: null, ...(isUuid(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug }) },
      select: { id: true },
    });
    if (!supplier) throw Errors.notFound("Supplier");

    const component = await tx.components.findFirst({
      where: { deleted_at: null, ...(isUuid(input.component) ? { id: input.component } : { generic_pn: input.component }) },
      select: { id: true, generic_pn: true, name: true },
    });
    if (!component) throw Errors.notFound("Component");

    const brand = await tx.brands.findFirst({
      where: { deleted_at: null, ...(isUuid(input.brand) ? { id: input.brand } : { slug: input.brand }) },
      select: { id: true, name: true },
    });
    if (!brand) throw Errors.notFound("Brand");

    const currency = (input.currency ?? "INR").toUpperCase().slice(0, 3);
    const existing = await tx.supplier_component_prices.findFirst({
      where: {
        supplier_id: supplier.id, component_id: component.id, brand_id: brand.id,
        valid_to: null, deleted_at: null,
      },
      select: { id: true },
    });

    if (existing) {
      await tx.supplier_component_prices.update({
        where: { id: existing.id },
        data: {
          updated_by: ctx.userId, updated_at: new Date(),
          price: input.price, currency,
          ...(input.moq !== undefined ? { moq: input.moq } : {}),
          ...(input.spq !== undefined ? { spq: input.spq } : {}),
          ...(input.leadTimeDays !== undefined ? { lead_time_days: input.leadTimeDays } : {}),
        },
      });
    } else {
      await tx.supplier_component_prices.create({
        data: {
          company_id: ctx.companyId, created_by: ctx.userId, updated_by: ctx.userId,
          supplier_id: supplier.id, component_id: component.id, brand_id: brand.id,
          price: input.price, currency,
          moq: input.moq ?? null, spq: input.spq ?? null, lead_time_days: input.leadTimeDays ?? null,
        },
      });
    }

    return {
      componentId: component.generic_pn, genericPN: component.generic_pn, componentName: component.name,
      brandId: input.brand, brandName: brand.name,
      price: input.price, currency, leadTimeDays: input.leadTimeDays ?? null,
    };
  });
}

// ── mappers ──────────────────────────────────────────────────────────────────
function mockSupplier(s: (typeof SUPPLIERS)[number]): SupplierView {
  return {
    id: s.id, slug: s.id, name: s.name, description: s.description, contact: s.contact,
    email: s.email, phone: s.phone, address: s.address, terms: s.terms, rating: s.rating, status: s.status,
  };
}

function fromDb(s: {
  id: string; slug: string; name: string; description: string | null; contact: string | null;
  email: string | null; phone: string | null; address: string | null; terms: string | null;
  rating: unknown; status: string;
}): SupplierView {
  return {
    id: s.id, slug: s.slug, name: s.name, description: s.description, contact: s.contact,
    email: s.email, phone: s.phone, address: s.address, terms: s.terms,
    rating: s.rating == null ? null : Number(s.rating), status: s.status,
  };
}
