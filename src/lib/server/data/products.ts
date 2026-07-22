/**
 * Products data access (mock/DB). Endpoints: list (with counts), detail (counts +
 * board list), and flattened BOM. DB mode resolves the CURRENT BOM: product's
 * Active bom_version → product_pcbs → Active-pinned pcb_revision → pcb_lines.
 * Component qty per unit = pcb_line.qty × product_pcbs.qty (ARCHITECTURE.md §7d).
 */
import { Prisma } from "@/generated/prisma/client";
import { withTenant, type TenantContext, type TxClient } from "@/lib/prisma";
import { Errors } from "@/lib/server/http";
import { assertPermission } from "@/lib/server/rbac";
import { requireSession } from "@/lib/server/session";
import { isUuid, lineHasContent, resolveOrCreateComponent, slugify, uniqueSlug } from "@/lib/server/data/util";

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
  return guarded("product.view", (tx) => productAggregate(tx));
}

export async function getProductDetail(idOrSlug: string): Promise<ProductDetailView> {
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

// ── create (POST /products) ─────────────────────────────────────────────────
// A manually-entered product is a flat list of components. Catalog products need
// a PCB layer (product → product_pcbs → pcb_revision → pcb_lines), so we synthesise
// ONE implicit board ("<name> Main Board") that holds every picked/created
// component. Each line either references an existing catalog component (by its
// generic_pn) or is created on the fly. See scripts/seed-sample.ts for the graph.

export interface CreateCatalogProductLine {
  /** generic_pn of an existing catalog component to link; absent → create a new one. */
  componentId?: string;
  name?: string;
  partNumber?: string;
  /** Maps to component.category. */
  type?: string;
  solderType?: "SMD" | "DIP";
  footprint?: string;
  qty: number;
}

/** A board on the product: its own component lines + how many per product unit. */
export interface CreateCatalogProductPcb {
  name?: string;
  /** Boards of this type per product unit (product_pcbs.qty). Default 1. */
  qty?: number;
  /** If linking an existing catalog PCB (slug or uuid). When set, uses its active revision. */
  linkedPcbId?: string;
  lines: CreateCatalogProductLine[];
}

export interface CreateCatalogProductInput {
  name: string;
  code?: string;
  description?: string;
  versionLabel?: string;
  status?: "Ready" | "Blocked" | "Limited";
  /** Preferred: components organised into one or more PCBs. */
  pcbs?: CreateCatalogProductPcb[];
  /** Legacy flat list — wrapped into a single auto "Main Board" when `pcbs` is absent. */
  lines?: CreateCatalogProductLine[];
}

export async function createCatalogProduct(input: CreateCatalogProductInput): Promise<ProductView> {
  return guarded("product.create", async (tx, ctx) => {
    const name = input.name.trim();
    if (!name) throw Errors.badRequest("Product name is required");

    // Normalise the input to a list of PCB groups. Explicit `pcbs` win; otherwise
    // a flat `lines` list is wrapped into a single auto-generated "Main Board".
    const groups: CreateCatalogProductPcb[] = (
      input.pcbs && input.pcbs.length
        ? input.pcbs.map((g) => ({ name: g.name, qty: g.qty, lines: (g.lines ?? []).filter(lineHasContent) }))
        : [{ name: `${name} Main Board`, qty: 1, lines: (input.lines ?? []).filter(lineHasContent) }]
    ).filter((g) => g.lines.length > 0);
    if (groups.length === 0) throw Errors.badRequest("Add at least one component line");

    const audit = { company_id: ctx.companyId!, created_by: ctx.userId, updated_by: ctx.userId };

    // 1) Product (unique slug) + Active BOM version.
    const slug = await uniqueSlug(tx, "products", slugify(name));
    const versionLabel = input.versionLabel?.trim() || "v1";
    const product = await tx.products.create({
      data: {
        ...audit,
        slug,
        // code is NOT NULL & unique per tenant — fall back to the (unique) slug.
        code: input.code?.trim() || slug.toUpperCase(),
        name,
        version: versionLabel,
        description: input.description?.trim() || null,
        status: input.status ?? "Ready",
      },
      select: { id: true },
    });
    const bom = await tx.bom_versions.create({
      data: { ...audit, product_id: product.id, version: versionLabel, status: "Active" },
      select: { id: true },
    });

    // 2) One PCB (+ Active revision + lines) per group, linked into the BOM.
    //    When the group has a `linkedPcbId` the user picked an existing catalog
    //    PCB from the typeahead — we reuse its Active revision as-is. Otherwise
    //    we create a fresh PCB + revision + lines on the fly.
    let sequence = 1;
    for (const group of groups) {
      let revisionId: string | null = null;

      if (group.linkedPcbId?.trim()) {
        // ── Reuse an existing catalog PCB ──────────────────────────────────
        const linkedSlug = group.linkedPcbId.trim();
        const existingPcb = await tx.pcbs.findFirst({
          where: {
            deleted_at: null,
            ...(isUuid(linkedSlug) ? { id: linkedSlug } : { OR: [{ slug: linkedSlug }, { id: linkedSlug }] }),
          },
          select: { id: true },
        });
        if (!existingPcb) throw Errors.badRequest(`Linked PCB "${linkedSlug}" not found`);
        // Find the Active revision for this PCB.
        const activeRev = await tx.pcb_revisions.findFirst({
          where: { pcb_id: existingPcb.id, status: "Active", deleted_at: null },
          select: { id: true },
          orderBy: { created_at: "desc" },
        });
        if (!activeRev) throw Errors.badRequest(`Linked PCB "${linkedSlug}" has no active revision`);
        revisionId = activeRev.id;
      }

      // No explicit link, but a PCB with the same name already exists → reuse it
      // instead of silently creating a duplicate board. Guards the common case
      // where the user typed (or picked, then edited) an existing PCB's name so
      // the typeahead link was dropped. Falls through to create only if there is
      // no matching PCB or it has no active revision.
      if (!revisionId && group.name?.trim()) {
        const byName = await tx.pcbs.findFirst({
          where: { deleted_at: null, name: { equals: group.name.trim(), mode: "insensitive" } },
          select: { id: true },
        });
        if (byName) {
          const activeRev = await tx.pcb_revisions.findFirst({
            where: { pcb_id: byName.id, status: "Active", deleted_at: null },
            select: { id: true },
            orderBy: { created_at: "desc" },
          });
          if (activeRev) revisionId = activeRev.id;
        }
      }

      if (!revisionId) {
        // ── Create a new PCB + revision + lines ──────────────────────────
        const pcbName = group.name?.trim() || `${name} Board ${sequence}`;
        const pcbSlug = await uniqueSlug(tx, "pcbs", slugify(pcbName) || `${slug}-board-${sequence}`);
        const pcb = await tx.pcbs.create({
          data: {
            ...audit,
            slug: pcbSlug,
            name: pcbName,
            description: `Board for ${name}`,
            status: "Active",
          },
          select: { id: true },
        });
        const rev = await tx.pcb_revisions.create({
          data: { ...audit, pcb_id: pcb.id, rev: "Rev A", status: "Active" },
          select: { id: true },
        });

        // Resolve/create components, aggregating qty by component so each board's
        // BOM stays one line per component.
        const qtyByComponent = new Map<string, number>();
        for (const line of group.lines) {
          const componentId = await resolveOrCreateComponent(tx, ctx, line);
          const qty = Math.max(1, Math.round(Number(line.qty) || 1));
          qtyByComponent.set(componentId, (qtyByComponent.get(componentId) ?? 0) + qty);
        }
        for (const [componentId, qty] of qtyByComponent) {
          await tx.pcb_lines.create({ data: { ...audit, pcb_revision_id: rev.id, component_id: componentId, qty } });
        }
        revisionId = rev.id;
      }

      await tx.product_pcbs.create({
        data: {
          ...audit,
          bom_version_id: bom.id,
          pcb_revision_id: revisionId,
          qty: Math.max(1, Math.round(Number(group.qty) || 1)),
          sequence,
        },
      });
      sequence++;
    }

    // Return the same aggregated view the list endpoint uses (counts now populated).
    const [view] = await productAggregate(tx, product.id);
    if (!view) throw Errors.notFound("Product");
    return view;
  });
}

// ── delete (DELETE /products/[id]) ──────────────────────────────────────────
// Soft-delete a catalog product and its BOM graph (bom_versions + product_pcbs
// join rows). The PCBs/components themselves are shared entities and are left
// intact — only the product's ownership of them is removed. Blocked (409) if any
// live production order still references the product.
export async function deleteCatalogProduct(idOrSlug: string): Promise<{ id: string; slug: string }> {
  return guarded("product.delete", async (tx, ctx) => {
    const product = await tx.products.findFirst({
      where: { deleted_at: null, ...(isUuid(idOrSlug) ? { id: idOrSlug } : { OR: [{ slug: idOrSlug }, { code: idOrSlug }] }) },
      select: { id: true, slug: true },
    });
    if (!product) throw Errors.notFound("Product");

    const inUse = await tx.$queryRaw<{ one: number }[]>`
      SELECT 1 AS one FROM production_orders
      WHERE product_id = ${product.id}::uuid AND deleted_at IS NULL
      LIMIT 1`;
    if (inUse.length) throw Errors.conflict("Product has production orders and cannot be deleted");

    const now = new Date();
    // Join rows first, then the BOM versions, then the product itself.
    await tx.$executeRaw`
      UPDATE product_pcbs pp SET deleted_at = ${now}, updated_by = ${ctx.userId}::uuid
      FROM bom_versions bv
      WHERE pp.bom_version_id = bv.id AND bv.product_id = ${product.id}::uuid AND pp.deleted_at IS NULL`;
    await tx.bom_versions.updateMany({
      where: { product_id: product.id, deleted_at: null },
      data: { deleted_at: now, updated_by: ctx.userId },
    });
    await tx.products.update({
      where: { id: product.id },
      data: { deleted_at: now, updated_by: ctx.userId },
    });
    return { id: product.id, slug: product.slug };
  });
}

export async function getProductBom(idOrSlug: string): Promise<ProductBomLineView[]> {
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
