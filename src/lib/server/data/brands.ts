/**
 * Brands data access (mock/DB, see docs/API.md "Data source toggle").
 * Endpoints: list, detail (by uuid or slug), and the brand's components.
 */
import { isTesting } from "@/lib/config";
import { withTenant, type TenantContext, type TxClient } from "@/lib/prisma";
import { ApiError, Errors } from "@/lib/server/http";
import { assertPermission } from "@/lib/server/rbac";
import { requireSession } from "@/lib/server/session";
import { isUuid } from "@/lib/server/data/util";
import { BRANDS, brandComponents as mockBrandComponents, getBrand } from "@/mockdata";

export interface BrandView {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  headquarter: string | null;
  founded: string | null;
  status: string;
  rating: number | null;
}

export interface BrandComponentView {
  id: string;
  genericPN: string;
  name: string;
  category: string | null;
}

async function guarded<T>(perm: string, fn: (tx: TxClient, ctx: TenantContext) => Promise<T>): Promise<T> {
  const ctx = await requireSession();
  return withTenant(ctx, async (tx) => {
    await assertPermission(tx, ctx, perm);
    return fn(tx, ctx);
  });
}

export async function listBrands(): Promise<BrandView[]> {
  if (isTesting) {
    return BRANDS.map(mockBrand).sort((a, b) => a.name.localeCompare(b.name));
  }
  return guarded("brand.view", async (tx) => {
    const rows = await tx.brands.findMany({ where: { deleted_at: null }, orderBy: { name: "asc" } });
    return rows.map(fromDb);
  });
}

export async function getBrandDetail(idOrSlug: string): Promise<BrandView> {
  if (isTesting) {
    const b = getBrand(idOrSlug) ?? BRANDS.find((x) => x.name === idOrSlug);
    if (!b) throw Errors.notFound("Brand");
    return mockBrand(b);
  }
  return guarded("brand.view", async (tx) => {
    const row = await tx.brands.findFirst({
      where: { deleted_at: null, ...(isUuid(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug }) },
    });
    if (!row) throw Errors.notFound("Brand");
    return fromDb(row);
  });
}

export async function getBrandComponents(idOrSlug: string): Promise<BrandComponentView[]> {
  if (isTesting) {
    const b = getBrand(idOrSlug);
    if (!b) throw Errors.notFound("Brand");
    return mockBrandComponents(b.id)
      .map((c) => ({ id: c.id, genericPN: c.genericPN, name: c.name, category: c.category }))
      .sort((a, b2) => a.name.localeCompare(b2.name));
  }
  return guarded("brand.view", async (tx) => {
    const brand = await tx.brands.findFirst({
      where: { deleted_at: null, ...(isUuid(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug }) },
      select: { id: true },
    });
    if (!brand) throw Errors.notFound("Brand");
    return tx.$queryRaw<BrandComponentView[]>`
      SELECT DISTINCT c.id, c.generic_pn AS "genericPN", c.name, c.category
      FROM components c
      JOIN component_brand_variants v ON v.component_id = c.id AND v.deleted_at IS NULL
      WHERE v.brand_id = ${brand.id}::uuid AND c.deleted_at IS NULL
      ORDER BY c.name`;
  });
}

// ── writes (create / edit) ─────────────────────────────────────────────────────
const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export interface CreateBrandInput {
  name: string;
  description?: string;
  headquarter?: string;
  founded?: string;
  status?: "Approved" | "Pending";
}

/** Create a brand (Add Brand form). slug is derived from the name and is the id-space key. */
export async function createBrand(input: CreateBrandInput): Promise<BrandView> {
  if (isTesting) throw new ApiError(400, "mock_read_only", "Brand writes are not available in mock mode (isTesting=true).");
  return guarded("brand.create", async (tx, ctx) => {
    const name = input.name.trim();
    const slug = slugify(name);
    if (!slug) throw Errors.badRequest("Brand name must contain letters or digits");
    const dupe = await tx.brands.findFirst({ where: { slug, deleted_at: null }, select: { id: true } });
    if (dupe) throw Errors.conflict("A brand with this name already exists", { slug });
    const row = await tx.brands.create({
      data: {
        company_id: ctx.companyId, created_by: ctx.userId, updated_by: ctx.userId,
        slug, name,
        description: input.description?.trim() || null,
        headquarter: input.headquarter?.trim() || null,
        founded: input.founded?.trim() || null,
        status: input.status ?? "Approved",
      },
    });
    return fromDb(row);
  });
}

export interface UpdateBrandInput {
  name?: string;
  description?: string | null;
  headquarter?: string | null;
  founded?: string | null;
  status?: "Approved" | "Pending";
  rating?: number | null;
}

/** Edit a brand's own fields (by uuid or slug). slug is immutable so id-space stays stable. */
export async function updateBrand(idOrSlug: string, patch: UpdateBrandInput): Promise<BrandView> {
  if (isTesting) throw new ApiError(400, "mock_read_only", "Brand writes are not available in mock mode (isTesting=true).");
  return guarded("brand.edit", async (tx, ctx) => {
    const existing = await tx.brands.findFirst({
      where: { deleted_at: null, ...(isUuid(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug }) },
      select: { id: true },
    });
    if (!existing) throw Errors.notFound("Brand");
    const row = await tx.brands.update({
      where: { id: existing.id },
      data: {
        updated_by: ctx.userId,
        updated_at: new Date(),
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
        ...(patch.headquarter !== undefined ? { headquarter: patch.headquarter?.trim() || null } : {}),
        ...(patch.founded !== undefined ? { founded: patch.founded?.trim() || null } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.rating !== undefined ? { rating: patch.rating } : {}),
      },
    });
    return fromDb(row);
  });
}

// ── brand ↔ supplier links ("Map Supplier") ────────────────────────────────────
export interface BrandSupplierView {
  id: string;
  supplierId: string; // supplier slug (bootstrap id-space)
  supplierName: string;
  estPrice: number | null;
  moq: number | null;
  leadTimeDays: number | null;
}

export interface AddBrandSupplierInput {
  supplier: string; // uuid, slug, or name
  estPrice?: number | null;
  moq?: number | null;
  leadTimeDays?: number | null;
}

async function resolveBrandId(tx: TxClient, idOrSlug: string): Promise<string> {
  const b = await tx.brands.findFirst({
    where: { deleted_at: null, ...(isUuid(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug }) },
    select: { id: true },
  });
  if (!b) throw Errors.notFound("Brand");
  return b.id;
}

async function resolveSupplier(tx: TxClient, key: string): Promise<{ id: string; slug: string; name: string }> {
  const s = await tx.suppliers.findFirst({
    where: {
      deleted_at: null,
      ...(isUuid(key) ? { id: key } : { OR: [{ slug: key }, { name: key }] }),
    },
    select: { id: true, slug: true, name: true },
  });
  if (!s) throw Errors.notFound("Supplier");
  return s;
}

export async function listBrandSuppliers(brandKey: string): Promise<BrandSupplierView[]> {
  if (isTesting) return [];
  return guarded("brand.view", async (tx) => {
    const brandId = await resolveBrandId(tx, brandKey);
    return tx.$queryRaw<BrandSupplierView[]>`
      SELECT bs.id, s.slug AS "supplierId", s.name AS "supplierName",
             bs.est_price::float8 AS "estPrice", bs.moq AS "moq", bs.lead_time_days AS "leadTimeDays"
      FROM brand_suppliers bs
      JOIN suppliers s ON s.id = bs.supplier_id AND s.deleted_at IS NULL
      WHERE bs.brand_id = ${brandId}::uuid AND bs.deleted_at IS NULL
      ORDER BY s.name`;
  });
}

export async function addBrandSupplier(brandKey: string, input: AddBrandSupplierInput): Promise<BrandSupplierView> {
  if (isTesting) throw new ApiError(400, "mock_read_only", "Brand-supplier writes are not available in mock mode (isTesting=true).");
  return guarded("brand.edit", async (tx, ctx) => {
    const brandId = await resolveBrandId(tx, brandKey);
    const sup = await resolveSupplier(tx, input.supplier);
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO brand_suppliers (company_id, brand_id, supplier_id, est_price, moq, lead_time_days, created_by, updated_by)
      VALUES (${ctx.companyId}::uuid, ${brandId}::uuid, ${sup.id}::uuid,
              ${input.estPrice ?? null}, ${input.moq ?? null}, ${input.leadTimeDays ?? null},
              ${ctx.userId}::uuid, ${ctx.userId}::uuid)
      ON CONFLICT (company_id, brand_id, supplier_id) WHERE deleted_at IS NULL
      DO UPDATE SET est_price = EXCLUDED.est_price, moq = EXCLUDED.moq,
                    lead_time_days = EXCLUDED.lead_time_days, updated_by = EXCLUDED.updated_by, updated_at = now()
      RETURNING id`;
    return {
      id: row.id,
      supplierId: sup.slug,
      supplierName: sup.name,
      estPrice: input.estPrice ?? null,
      moq: input.moq ?? null,
      leadTimeDays: input.leadTimeDays ?? null,
    };
  });
}

export async function removeBrandSupplier(brandKey: string, supplierKey: string): Promise<{ ok: true }> {
  if (isTesting) throw new ApiError(400, "mock_read_only", "Brand-supplier writes are not available in mock mode (isTesting=true).");
  return guarded("brand.edit", async (tx, ctx) => {
    const brandId = await resolveBrandId(tx, brandKey);
    const sup = await resolveSupplier(tx, supplierKey);
    await tx.$executeRaw`
      UPDATE brand_suppliers SET deleted_at = now(), updated_by = ${ctx.userId}::uuid
      WHERE brand_id = ${brandId}::uuid AND supplier_id = ${sup.id}::uuid AND deleted_at IS NULL`;
    return { ok: true as const };
  });
}

// ── mappers ──────────────────────────────────────────────────────────────────
function mockBrand(b: (typeof BRANDS)[number]): BrandView {
  return {
    id: b.id, slug: b.id, name: b.name, description: b.description,
    headquarter: b.headquarter, founded: b.founded, status: b.status, rating: b.rating,
  };
}

function fromDb(b: {
  id: string; slug: string; name: string; description: string | null;
  headquarter: string | null; founded: string | null; status: string; rating: unknown;
}): BrandView {
  return {
    id: b.id, slug: b.slug, name: b.name, description: b.description,
    headquarter: b.headquarter, founded: b.founded, status: b.status,
    rating: b.rating == null ? null : Number(b.rating),
  };
}
