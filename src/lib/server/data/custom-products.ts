/**
 * Custom (user-added) products data access — products added via "Import BOM" or
 * "Add Manually". Their BOM lines are arbitrary free-text part numbers, NOT
 * registered catalog components, so they live in their own tables
 * (`custom_products` + `custom_bom_versions`, raw lines as JSONB) rather than the
 * catalog product -> pcb -> component graph. See docs/schema.sql.
 *
 * The client-facing id is `cp-<slug>` (so the UI can tell a custom product from a
 * catalog product via isUserProductId); the DB PK is a uuid. Version ids are the
 * raw uuids and are used opaquely by the UI. Mirrors the shape the client
 * `useUserProducts` context expects, so it maps 1:1.
 */
import { Prisma } from "@/generated/prisma/client";
import { isTesting } from "@/lib/config";
import { withTenant, type TenantContext, type TxClient } from "@/lib/prisma";
import { ApiError, Errors } from "@/lib/server/http";
import { assertPermission } from "@/lib/server/rbac";
import { requireSession } from "@/lib/server/session";
import { isUuid } from "@/lib/server/data/util";
import type { ImportedBomLine } from "@/lib/bom-import";

// Lets a ternary embed a parameterised SQL fragment into a $queryRaw template.
const tag = Prisma.sql;

export type CustomBomSource = "import" | "manual";

export interface CustomBomVersionView {
  id: string;
  label: string;
  source: CustomBomSource;
  fileName?: string;
  note?: string;
  createdAt: string;
  lines: ImportedBomLine[];
}

export interface CustomProductView {
  id: string; // "cp-<slug>"
  name: string;
  code: string;
  description: string;
  source: CustomBomSource;
  versions: CustomBomVersionView[];
  activeVersionId: string;
  createdAt: string;
}

export interface NewVersionInput {
  label?: string;
  source: CustomBomSource;
  fileName?: string;
  note?: string;
  lines: ImportedBomLine[];
}

export interface NewProductInput {
  name: string;
  code?: string;
  description?: string;
  source: CustomBomSource;
  version: NewVersionInput;
}

const mockReadOnly = () =>
  new ApiError(400, "mock_read_only", "Custom product writes are not available in mock mode (isTesting=true).");

async function guarded<T>(perm: string, fn: (tx: TxClient, ctx: TenantContext) => Promise<T>): Promise<T> {
  const ctx = await requireSession();
  return withTenant(ctx, async (tx) => {
    await assertPermission(tx, ctx, perm);
    return fn(tx, ctx);
  });
}

const clientId = (slug: string) => `cp-${slug}`;
const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "product";

/** Resolve a client id ("cp-<slug>", a bare slug, or a uuid) to the DB uuid. */
async function resolveProductId(tx: TxClient, key: string): Promise<string> {
  const bare = key.startsWith("cp-") ? key.slice(3) : key;
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM custom_products
    WHERE deleted_at IS NULL AND ${isUuid(bare) ? tag`id = ${bare}::uuid` : tag`slug = ${bare}`}
    LIMIT 1`;
  if (!rows[0]) throw Errors.notFound("Product");
  return rows[0].id;
}

interface ProductRow {
  id: string; slug: string; name: string; code: string | null;
  description: string | null; source: string; active_version_id: string | null; created_at: Date;
}
interface VersionRow {
  id: string; label: string; source: string; file_name: string | null;
  note: string | null; created_at: Date; lines: ImportedBomLine[];
}

function toView(p: ProductRow, versions: VersionRow[]): CustomProductView {
  return {
    id: clientId(p.slug),
    name: p.name,
    code: p.code ?? "",
    description: p.description ?? "",
    source: p.source as CustomBomSource,
    activeVersionId: p.active_version_id ?? versions[0]?.id ?? "",
    createdAt: p.created_at.toISOString(),
    versions: versions.map((v) => ({
      id: v.id,
      label: v.label,
      source: v.source as CustomBomSource,
      fileName: v.file_name ?? undefined,
      note: v.note ?? undefined,
      createdAt: v.created_at.toISOString(),
      lines: Array.isArray(v.lines) ? v.lines : [],
    })),
  };
}

/** Build the full view for one product (product row + its live versions). */
async function buildProductView(tx: TxClient, id: string): Promise<CustomProductView> {
  const [p] = await tx.$queryRaw<ProductRow[]>`
    SELECT id, slug, name, code, description, source, active_version_id, created_at
    FROM custom_products WHERE id = ${id}::uuid AND deleted_at IS NULL`;
  if (!p) throw Errors.notFound("Product");
  const versions = await tx.$queryRaw<VersionRow[]>`
    SELECT id, label, source, file_name, note, created_at, lines
    FROM custom_bom_versions
    WHERE custom_product_id = ${id}::uuid AND deleted_at IS NULL
    ORDER BY created_at ASC`;
  return toView(p, versions);
}

export async function listCustomProducts(): Promise<CustomProductView[]> {
  if (isTesting) return [];
  return guarded("product.view", async (tx) => {
    const products = await tx.$queryRaw<ProductRow[]>`
      SELECT id, slug, name, code, description, source, active_version_id, created_at
      FROM custom_products WHERE deleted_at IS NULL ORDER BY created_at DESC`;
    if (products.length === 0) return [];
    // RLS already scopes to the tenant, so fetch all live versions and group.
    const versions = await tx.$queryRaw<(VersionRow & { custom_product_id: string })[]>`
      SELECT id, custom_product_id, label, source, file_name, note, created_at, lines
      FROM custom_bom_versions WHERE deleted_at IS NULL ORDER BY created_at ASC`;
    const byProduct = new Map<string, VersionRow[]>();
    for (const v of versions) {
      (byProduct.get(v.custom_product_id) ?? byProduct.set(v.custom_product_id, []).get(v.custom_product_id)!).push(v);
    }
    return products.map((p) => toView(p, byProduct.get(p.id) ?? []));
  });
}

export async function createCustomProduct(input: NewProductInput): Promise<CustomProductView> {
  if (isTesting) throw mockReadOnly();
  return guarded("product.create", async (tx, ctx) => {
    const name = input.name.trim();
    if (!name) throw Errors.badRequest("Product name is required");

    // Derive a unique slug per tenant (base, base-2, base-3, …).
    const base = slugify(name);
    const taken = await tx.$queryRaw<{ slug: string }[]>`
      SELECT slug FROM custom_products
      WHERE deleted_at IS NULL AND (slug = ${base} OR slug LIKE ${base + "-%"})`;
    const takenSet = new Set(taken.map((r) => r.slug));
    let slug = base;
    let n = 2;
    while (takenSet.has(slug)) slug = `${base}-${n++}`;

    const description =
      input.description?.trim() ||
      `${input.source === "manual" ? "Manually created" : "Imported"} · ${input.version.lines.length} components`;

    const [{ id: productId }] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO custom_products (company_id, created_by, updated_by, slug, name, code, description, source)
      VALUES (${ctx.companyId}::uuid, ${ctx.userId}::uuid, ${ctx.userId}::uuid,
              ${slug}, ${name}, ${input.code?.trim() || null}, ${description}, ${input.source})
      RETURNING id`;

    const versionId = await insertVersion(tx, ctx, productId, {
      ...input.version,
      label: input.version.label?.trim() || "v1",
    });

    await tx.$executeRaw`
      UPDATE custom_products SET active_version_id = ${versionId}::uuid WHERE id = ${productId}::uuid`;

    return buildProductView(tx, productId);
  });
}

export async function addCustomVersion(key: string, input: NewVersionInput): Promise<CustomProductView> {
  if (isTesting) throw mockReadOnly();
  return guarded("product.create", async (tx, ctx) => {
    const productId = await resolveProductId(tx, key);
    const [{ count }] = await tx.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM custom_bom_versions
      WHERE custom_product_id = ${productId}::uuid AND deleted_at IS NULL`;
    const label = input.label?.trim() || `v${Number(count) + 1}`;
    const versionId = await insertVersion(tx, ctx, productId, { ...input, label });
    await tx.$executeRaw`
      UPDATE custom_products SET active_version_id = ${versionId}::uuid, updated_by = ${ctx.userId}::uuid
      WHERE id = ${productId}::uuid`;
    return buildProductView(tx, productId);
  });
}

export async function setActiveCustomVersion(key: string, versionId: string): Promise<CustomProductView> {
  if (isTesting) throw mockReadOnly();
  return guarded("product.edit", async (tx, ctx) => {
    const productId = await resolveProductId(tx, key);
    const [exists] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM custom_bom_versions
      WHERE id = ${versionId}::uuid AND custom_product_id = ${productId}::uuid AND deleted_at IS NULL`;
    if (!exists) throw Errors.notFound("Version");
    await tx.$executeRaw`
      UPDATE custom_products SET active_version_id = ${versionId}::uuid, updated_by = ${ctx.userId}::uuid
      WHERE id = ${productId}::uuid`;
    return buildProductView(tx, productId);
  });
}

export async function removeCustomVersion(key: string, versionId: string): Promise<CustomProductView> {
  if (isTesting) throw mockReadOnly();
  return guarded("product.edit", async (tx, ctx) => {
    const productId = await resolveProductId(tx, key);
    const live = await tx.$queryRaw<{ id: string; active: boolean }[]>`
      SELECT v.id, (v.id = p.active_version_id) AS active
      FROM custom_bom_versions v JOIN custom_products p ON p.id = v.custom_product_id
      WHERE v.custom_product_id = ${productId}::uuid AND v.deleted_at IS NULL
      ORDER BY v.created_at ASC`;
    if (live.length <= 1) throw Errors.badRequest("A product must keep at least one BOM version");
    if (!live.some((v) => v.id === versionId)) throw Errors.notFound("Version");

    await tx.$executeRaw`
      UPDATE custom_bom_versions SET deleted_at = now(), updated_by = ${ctx.userId}::uuid
      WHERE id = ${versionId}::uuid`;

    // If we removed the active version, fall back to the latest remaining one.
    const wasActive = live.find((v) => v.id === versionId)?.active;
    if (wasActive) {
      const remaining = live.filter((v) => v.id !== versionId);
      const next = remaining[remaining.length - 1].id;
      await tx.$executeRaw`
        UPDATE custom_products SET active_version_id = ${next}::uuid, updated_by = ${ctx.userId}::uuid
        WHERE id = ${productId}::uuid`;
    }
    return buildProductView(tx, productId);
  });
}

export async function removeCustomProduct(key: string): Promise<{ id: string }> {
  if (isTesting) throw mockReadOnly();
  return guarded("product.delete", async (tx, ctx) => {
    const productId = await resolveProductId(tx, key);
    // Drop the active pointer first so the version soft-delete doesn't dangle, then soft-delete both.
    await tx.$executeRaw`
      UPDATE custom_products SET active_version_id = NULL, deleted_at = now(), updated_by = ${ctx.userId}::uuid
      WHERE id = ${productId}::uuid`;
    await tx.$executeRaw`
      UPDATE custom_bom_versions SET deleted_at = now(), updated_by = ${ctx.userId}::uuid
      WHERE custom_product_id = ${productId}::uuid AND deleted_at IS NULL`;
    return { id: key };
  });
}

async function insertVersion(
  tx: TxClient,
  ctx: TenantContext,
  productId: string,
  v: NewVersionInput,
): Promise<string> {
  const [{ id }] = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO custom_bom_versions
      (company_id, custom_product_id, created_by, updated_by, label, source, file_name, note, lines)
    VALUES (${ctx.companyId}::uuid, ${productId}::uuid, ${ctx.userId}::uuid, ${ctx.userId}::uuid,
            ${v.label ?? "v1"}, ${v.source}, ${v.fileName ?? null}, ${v.note ?? null},
            ${JSON.stringify(v.lines ?? [])}::jsonb)
    RETURNING id`;
  return id;
}
