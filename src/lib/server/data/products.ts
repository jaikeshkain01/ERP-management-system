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
import { isUuid } from "@/lib/server/data/util";

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

const lineHasContent = (l: CreateCatalogProductLine) =>
  !!(l.componentId?.trim() || l.name?.trim() || l.partNumber?.trim());

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

/** Pick a slug free of collisions in `table` for this tenant (base, base-2, base-3, …). */
async function uniqueSlug(tx: TxClient, table: "products" | "pcbs", base: string): Promise<string> {
  const root = base || "item";
  const rows =
    table === "products"
      ? await tx.$queryRaw<{ slug: string }[]>`
          SELECT slug FROM products WHERE deleted_at IS NULL AND (slug = ${root} OR slug LIKE ${root + "-%"})`
      : await tx.$queryRaw<{ slug: string }[]>`
          SELECT slug FROM pcbs WHERE deleted_at IS NULL AND (slug = ${root} OR slug LIKE ${root + "-%"})`;
  const taken = new Set(rows.map((r) => r.slug));
  let slug = root;
  let n = 2;
  while (taken.has(slug)) slug = `${root}-${n++}`;
  return slug;
}

/** Resolve a line to a component uuid: link an existing one (by generic_pn) or create it. */
async function resolveOrCreateComponent(
  tx: TxClient,
  ctx: TenantContext,
  line: CreateCatalogProductLine,
): Promise<string> {
  const audit = { company_id: ctx.companyId, created_by: ctx.userId, updated_by: ctx.userId };

  // Explicit link to an existing catalog component.
  const explicit = line.componentId?.trim();
  if (explicit) {
    const c = await tx.components.findFirst({ where: { generic_pn: explicit, deleted_at: null }, select: { id: true } });
    if (c) return c.id;
  }

  // Otherwise derive a stable generic_pn and dedupe by it (re-typing an existing
  // part links to it instead of creating a duplicate).
  const genericPN = (line.partNumber?.trim() || explicit || slugify(line.name ?? "").toUpperCase()) || "PART";
  const dupe = await tx.components.findFirst({ where: { generic_pn: genericPN, deleted_at: null }, select: { id: true } });
  if (dupe) return dupe.id;

  const created = await tx.components.create({
    data: {
      ...audit,
      generic_pn: genericPN,
      name: line.name?.trim() || genericPN,
      category: line.type?.trim() || null,
      unit: "PCS",
      solder_type: line.solderType ?? null,
      footprint: line.footprint?.trim() || null,
      min_stock: 0,
      reorder_qty: 0,
      annual_consumption: 0,
      specs: [],
    },
    select: { id: true },
  });
  return created.id;
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

    const audit = { company_id: ctx.companyId, created_by: ctx.userId, updated_by: ctx.userId };

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
      let revisionId: string;

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
      } else {
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
