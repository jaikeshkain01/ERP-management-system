/**
 * Products data access (mock/DB). Endpoints: list (with counts), detail (counts +
 * board list), and flattened BOM. DB mode resolves the CURRENT BOM: product's
 * Active bom_version → product_pcbs → Active-pinned pcb_revision → pcb_lines.
 * Component qty per unit = pcb_line.qty × product_pcbs.qty (ARCHITECTURE.md §7d).
 */
import { Prisma } from "@/generated/prisma/client";
import { isTesting } from "@/lib/config";
import { withTenant, type TenantContext, type TxClient } from "@/lib/prisma";
import { Errors } from "@/lib/server/http";
import { assertPermission } from "@/lib/server/rbac";
import { requireSession } from "@/lib/server/session";
import { isUuid } from "@/lib/server/data/util";
import {
  PRODUCTS,
  getProduct,
  productPcbList,
  productBom as mockProductBom,
  productUniqueComponents,
  productTotalParts,
  productBrandCount,
} from "@/mockdata";

export interface ProductView {
  id: string;
  slug: string;
  code: string;
  name: string;
  version: string | null;
  description: string | null;
  status: string;
  estimatedCost: number | null;
  pcbCount: number;
  uniqueComponentsCount: number;
}

export interface ProductDetailView extends ProductView {
  totalParts: number;
  brandCount: number;
  pcbs: { id: string; slug: string; name: string; qty: number; sequence: number | null; remarks: string | null }[];
}

export interface ProductBomLineView {
  pcb: { id: string; name: string };
  component: { id: string; genericPN: string; name: string };
  qty: number;
}

async function guarded<T>(perm: string, fn: (tx: TxClient, ctx: TenantContext) => Promise<T>): Promise<T> {
  const ctx = await requireSession();
  return withTenant(ctx, async (tx) => {
    await assertPermission(tx, ctx, perm);
    return fn(tx, ctx);
  });
}

async function resolveProductId(tx: TxClient, idOrSlug: string): Promise<string> {
  const p = await tx.products.findFirst({
    where: { deleted_at: null, ...(isUuid(idOrSlug) ? { id: idOrSlug } : { OR: [{ slug: idOrSlug }, { code: idOrSlug }] }) },
    select: { id: true },
  });
  if (!p) throw Errors.notFound("Product");
  return p.id;
}

function productAggregate(tx: TxClient, id?: string) {
  const filter = id ? Prisma.sql`AND p.id = ${id}::uuid` : Prisma.empty;
  return tx.$queryRaw<ProductView[]>`
    SELECT p.id, p.slug, p.code, p.name, p.version, p.description, p.status,
      p.estimated_cost::float8 AS "estimatedCost",
      (SELECT COUNT(*)::int FROM bom_versions bv
         JOIN product_pcbs pp ON pp.bom_version_id = bv.id AND pp.deleted_at IS NULL
         WHERE bv.product_id = p.id AND bv.status = 'Active' AND bv.deleted_at IS NULL) AS "pcbCount",
      (SELECT COUNT(DISTINCT pl.component_id)::int FROM bom_versions bv
         JOIN product_pcbs pp ON pp.bom_version_id = bv.id AND pp.deleted_at IS NULL
         JOIN pcb_revisions pr ON pr.id = pp.pcb_revision_id
         JOIN pcb_lines pl ON pl.pcb_revision_id = pr.id AND pl.deleted_at IS NULL
         WHERE bv.product_id = p.id AND bv.status = 'Active' AND bv.deleted_at IS NULL) AS "uniqueComponentsCount"
    FROM products p
    WHERE p.deleted_at IS NULL ${filter}
    ORDER BY p.name`;
}

export async function listProducts(): Promise<ProductView[]> {
  if (isTesting) {
    return PRODUCTS.map(mockProductView).sort((a, b) => a.name.localeCompare(b.name));
  }
  return guarded("product.view", (tx) => productAggregate(tx));
}

export async function getProductDetail(idOrSlug: string): Promise<ProductDetailView> {
  if (isTesting) {
    const p = getProduct(idOrSlug);
    if (!p) throw Errors.notFound("Product");
    return {
      ...mockProductView(p),
      totalParts: productTotalParts(p),
      brandCount: productBrandCount(p),
      pcbs: productPcbList(p).map((e) => ({
        id: e.pcb.id, slug: e.pcb.id, name: e.pcb.name, qty: e.qty, sequence: e.sequence, remarks: e.remarks ?? null,
      })),
    };
  }
  return guarded("product.view", async (tx) => {
    const id = await resolveProductId(tx, idOrSlug);
    const base = (await productAggregate(tx, id))[0];
    if (!base) throw Errors.notFound("Product");

    const [{ totalParts }] = await tx.$queryRaw<{ totalParts: number }[]>`
      SELECT COALESCE(SUM(pl.qty * pp.qty), 0)::int AS "totalParts"
      FROM bom_versions bv
      JOIN product_pcbs pp ON pp.bom_version_id = bv.id AND pp.deleted_at IS NULL
      JOIN pcb_revisions pr ON pr.id = pp.pcb_revision_id
      JOIN pcb_lines pl ON pl.pcb_revision_id = pr.id AND pl.deleted_at IS NULL
      WHERE bv.product_id = ${id}::uuid AND bv.status = 'Active' AND bv.deleted_at IS NULL`;

    const [{ brandCount }] = await tx.$queryRaw<{ brandCount: number }[]>`
      SELECT COUNT(DISTINCT v.brand_id)::int AS "brandCount"
      FROM component_brand_variants v
      WHERE v.deleted_at IS NULL AND v.component_id IN (
        SELECT DISTINCT pl.component_id FROM bom_versions bv
        JOIN product_pcbs pp ON pp.bom_version_id = bv.id AND pp.deleted_at IS NULL
        JOIN pcb_revisions pr ON pr.id = pp.pcb_revision_id
        JOIN pcb_lines pl ON pl.pcb_revision_id = pr.id AND pl.deleted_at IS NULL
        WHERE bv.product_id = ${id}::uuid AND bv.status = 'Active' AND bv.deleted_at IS NULL
      )`;

    const pcbs = await tx.$queryRaw<ProductDetailView["pcbs"]>`
      SELECT pc.id, pc.slug, pc.name, pp.qty::int AS qty, pp.sequence, pp.remarks
      FROM bom_versions bv
      JOIN product_pcbs pp ON pp.bom_version_id = bv.id AND pp.deleted_at IS NULL
      JOIN pcb_revisions pr ON pr.id = pp.pcb_revision_id
      JOIN pcbs pc ON pc.id = pr.pcb_id AND pc.deleted_at IS NULL
      WHERE bv.product_id = ${id}::uuid AND bv.status = 'Active' AND bv.deleted_at IS NULL
      ORDER BY pp.sequence NULLS LAST, pc.name`;

    return { ...base, totalParts, brandCount, pcbs };
  });
}

export async function getProductBom(idOrSlug: string): Promise<ProductBomLineView[]> {
  if (isTesting) {
    const p = getProduct(idOrSlug);
    if (!p) throw Errors.notFound("Product");
    return mockProductBom(p).map((l) => ({
      pcb: { id: l.pcb.id, name: l.pcb.name },
      component: { id: l.component.id, genericPN: l.component.genericPN, name: l.component.name },
      qty: l.qty,
    }));
  }
  return guarded("product.view", async (tx) => {
    const id = await resolveProductId(tx, idOrSlug);
    const rows = await tx.$queryRaw<{
      pcbId: string; pcbName: string; componentId: string; genericPN: string; componentName: string; qty: number;
    }[]>`
      SELECT pc.id AS "pcbId", pc.name AS "pcbName",
             c.id AS "componentId", c.generic_pn AS "genericPN", c.name AS "componentName",
             (pl.qty * pp.qty)::int AS qty
      FROM bom_versions bv
      JOIN product_pcbs pp ON pp.bom_version_id = bv.id AND pp.deleted_at IS NULL
      JOIN pcb_revisions pr ON pr.id = pp.pcb_revision_id
      JOIN pcbs pc ON pc.id = pr.pcb_id AND pc.deleted_at IS NULL
      JOIN pcb_lines pl ON pl.pcb_revision_id = pr.id AND pl.deleted_at IS NULL
      JOIN components c ON c.id = pl.component_id AND c.deleted_at IS NULL
      WHERE bv.product_id = ${id}::uuid AND bv.status = 'Active' AND bv.deleted_at IS NULL
      ORDER BY pc.name, c.name`;
    return rows.map((r) => ({
      pcb: { id: r.pcbId, name: r.pcbName },
      component: { id: r.componentId, genericPN: r.genericPN, name: r.componentName },
      qty: r.qty,
    }));
  });
}

function mockProductView(p: (typeof PRODUCTS)[number]): ProductView {
  return {
    id: p.id, slug: p.id, code: p.code, name: p.name, version: p.version, description: p.description,
    status: p.status, estimatedCost: p.estimatedCost,
    pcbCount: productPcbList(p).length,
    uniqueComponentsCount: productUniqueComponents(p).length,
  };
}
