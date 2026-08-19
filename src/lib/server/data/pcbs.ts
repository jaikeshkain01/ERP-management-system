/**
 * PCBs data access (mock/DB). Endpoints: list (with BOM totals + used-in),
 * detail, and resolved BOM. DB mode resolves through the Active pcb_revision
 * (the versioning layer the mock doesn't have — see ARCHITECTURE.md §7d).
 */
import { Prisma } from "@/generated/prisma/client";
import { withTenant, type TenantContext, type TxClient } from "@/lib/prisma";
import { Errors } from "@/lib/server/http";
import { assertPermission } from "@/lib/server/rbac";
import { requireSession } from "@/lib/server/session";
import {
  isUuid,
  lineHasContent,
  resolveOrCreateComponent,
  slugify,
  uniqueSlug,
  type ResolveComponentLine,
} from "@/lib/server/data/util";

export interface PcbView {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  layers: number | null;
  status: string;
  lineCount: number;
  totalParts: number;
  usedInProducts: string[];
}

export interface PcbBomLineView {
  component: { id: string; genericPN: string; name: string; category: string | null; unit: string };
  qty: number;
  refDes: string | null;
  preferredBrand: { id: string; name: string } | null;
  remarks: string | null;
}

async function guarded<T>(perm: string, fn: (tx: TxClient, ctx: TenantContext) => Promise<T>): Promise<T> {
  const ctx = await requireSession();
  return withTenant(ctx, async (tx) => {
    await assertPermission(tx, ctx, perm);
    return fn(tx, ctx);
  });
}

async function resolvePcbId(tx: TxClient, idOrSlug: string): Promise<string> {
  const pcb = await tx.pcbs.findFirst({
    where: { deleted_at: null, ...(isUuid(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug }) },
    select: { id: true },
  });
  if (!pcb) throw Errors.notFound("PCB");
  return pcb.id;
}

/** Aggregate PCB rows (line count, total parts, product codes used-in). `id` filters to one. */
function pcbAggregate(tx: TxClient, id?: string) {
  const filter = id ? Prisma.sql`AND pc.id = ${id}::uuid` : Prisma.empty;
  return tx.$queryRaw<PcbView[]>`
    SELECT pc.id, pc.slug, pc.name, pc.description, pc.layers, pc.status,
      COUNT(DISTINCT pl.id)::int AS "lineCount",
      COALESCE(SUM(pl.qty), 0)::int AS "totalParts",
      ARRAY(
        SELECT DISTINCT p.code FROM products p
        JOIN bom_versions bv ON bv.product_id = p.id AND bv.status = 'Active' AND bv.deleted_at IS NULL
        JOIN product_pcbs pp ON pp.bom_version_id = bv.id AND pp.deleted_at IS NULL
        JOIN pcb_revisions pr2 ON pr2.id = pp.pcb_revision_id
        WHERE pr2.pcb_id = pc.id AND p.deleted_at IS NULL
      ) AS "usedInProducts"
    FROM pcbs pc
    LEFT JOIN pcb_revisions pr ON pr.pcb_id = pc.id AND pr.status = 'Active' AND pr.deleted_at IS NULL
    LEFT JOIN pcb_lines pl ON pl.pcb_revision_id = pr.id AND pl.deleted_at IS NULL
    WHERE pc.deleted_at IS NULL ${filter}
    GROUP BY pc.id
    ORDER BY pc.name`;
}

export async function listPcbs(): Promise<PcbView[]> {
  return guarded("pcb.view", (tx) => pcbAggregate(tx));
}

export async function getPcbDetail(idOrSlug: string): Promise<PcbView> {
  return guarded("pcb.view", async (tx) => {
    const id = await resolvePcbId(tx, idOrSlug);
    const rows = await pcbAggregate(tx, id);
    if (!rows.length) throw Errors.notFound("PCB");
    return rows[0];
  });
}

// ── create (POST /pcbs) ──────────────────────────────────────────────────────
// A standalone PCB is a board (name/layers/status) plus a BOM of components. We
// synthesise the versioning layer the mock lacks: one PCB row + its Active
// `pcb_revision` ("Rev A") + a `pcb_line` per component. Each line links an
// existing catalog component (by generic_pn) or is created on the fly, mirroring
// the per-board logic in createCatalogProduct (products.ts).

export type CreatePcbLine = ResolveComponentLine;

export interface CreatePcbInput {
  name: string;
  description?: string;
  layers?: number;
  status?: "Active" | "Prototype" | "Deprecated";
  lines: CreatePcbLine[];
}

export async function createPcb(input: CreatePcbInput): Promise<PcbView> {
  return guarded("pcb.create", async (tx, ctx) => {
    const name = input.name.trim();
    if (!name) throw Errors.badRequest("PCB name is required");

    const lines = (input.lines ?? []).filter(lineHasContent);
    if (lines.length === 0) throw Errors.badRequest("Add at least one component line");

    const audit = { company_id: ctx.companyId!, created_by: ctx.userId, updated_by: ctx.userId };

    // 1) PCB (unique slug) + its Active revision.
    const slug = await uniqueSlug(tx, "pcbs", slugify(name));
    const pcb = await tx.pcbs.create({
      data: {
        ...audit,
        slug,
        name,
        description: input.description?.trim() || null,
        layers: input.layers ?? null,
        status: input.status ?? "Active",
      },
      select: { id: true },
    });
    const rev = await tx.pcb_revisions.create({
      data: { ...audit, pcb_id: pcb.id, rev: "Rev A", status: "Active" },
      select: { id: true },
    });

    // 2) Resolve/create components, aggregating qty so each board's BOM stays one
    //    line per component.
    const qtyByComponent = new Map<string, number>();
    for (const line of lines) {
      const componentId = await resolveOrCreateComponent(tx, ctx, line);
      const qty = Math.max(1, Math.round(Number(line.qty) || 1));
      qtyByComponent.set(componentId, (qtyByComponent.get(componentId) ?? 0) + qty);
    }
    for (const [componentId, qty] of qtyByComponent) {
      await tx.pcb_lines.create({ data: { ...audit, pcb_revision_id: rev.id, component_id: componentId, qty } });
    }

    const [view] = await pcbAggregate(tx, pcb.id);
    if (!view) throw Errors.notFound("PCB");
    return view;
  });
}

// ── edit / soft-delete (PATCH / DELETE /pcbs/[id]) ───────────────────────────

export interface UpdatePcbInput {
  name?: string;
  description?: string | null;
  layers?: number | null;
  status?: "Active" | "Prototype" | "Deprecated";
  /** When provided, REPLACES the active revision's BOM (same shape as create). */
  lines?: CreatePcbLine[];
}

/** Edit a PCB's own fields (by uuid or slug). The slug stays stable so links don't break.
 *  When `lines` is supplied, the Active revision's BOM is rebuilt to match (each line
 *  links an existing component by generic_pn or creates one, mirroring createPcb). */
export async function updatePcb(idOrSlug: string, patch: UpdatePcbInput): Promise<PcbView> {
  return guarded("pcb.edit", async (tx, ctx) => {
    const existing = await tx.pcbs.findFirst({
      where: { deleted_at: null, ...(isUuid(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug }) },
      select: { id: true },
    });
    if (!existing) throw Errors.notFound("PCB");

    await tx.pcbs.update({
      where: { id: existing.id },
      data: {
        updated_by: ctx.userId,
        updated_at: new Date(),
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
        ...(patch.layers !== undefined ? { layers: patch.layers } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
      },
    });

    // Rebuild the BOM on the Active revision when `lines` is provided.
    if (patch.lines !== undefined) {
      const lines = patch.lines.filter(lineHasContent);
      if (lines.length === 0) throw Errors.badRequest("A PCB must have at least one component line");

      const audit = { company_id: ctx.companyId!, created_by: ctx.userId, updated_by: ctx.userId };
      let rev = await tx.pcb_revisions.findFirst({
        where: { pcb_id: existing.id, status: "Active", deleted_at: null },
        select: { id: true },
        orderBy: { created_at: "desc" },
      });
      if (!rev) {
        rev = await tx.pcb_revisions.create({
          data: { ...audit, pcb_id: existing.id, rev: "Rev A", status: "Active" },
          select: { id: true },
        });
      }

      // Soft-delete the current lines, then re-create from the submitted BOM.
      await tx.pcb_lines.updateMany({
        where: { pcb_revision_id: rev.id, deleted_at: null },
        data: { deleted_at: new Date(), updated_by: ctx.userId },
      });
      const qtyByComponent = new Map<string, number>();
      for (const line of lines) {
        const componentId = await resolveOrCreateComponent(tx, ctx, line);
        const qty = Math.max(1, Math.round(Number(line.qty) || 1));
        qtyByComponent.set(componentId, (qtyByComponent.get(componentId) ?? 0) + qty);
      }
      for (const [componentId, qty] of qtyByComponent) {
        await tx.pcb_lines.create({ data: { ...audit, pcb_revision_id: rev.id, component_id: componentId, qty } });
      }
    }

    const [view] = await pcbAggregate(tx, existing.id);
    if (!view) throw Errors.notFound("PCB");
    return view;
  });
}

/** Soft-delete a PCB (by uuid or slug). Blocked if it is referenced by any product BOM. */
export async function deletePcb(idOrSlug: string): Promise<{ id: string; slug: string }> {
  return guarded("pcb.delete", async (tx, ctx) => {
    const pcb = await tx.pcbs.findFirst({
      where: { deleted_at: null, ...(isUuid(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug }) },
      select: { id: true, slug: true },
    });
    if (!pcb) throw Errors.notFound("PCB");

    const inUse = await tx.$queryRaw<{ one: number }[]>`
      SELECT 1 AS one
      FROM product_pcbs pp
      JOIN pcb_revisions pr ON pr.id = pp.pcb_revision_id
      JOIN bom_versions bv ON bv.id = pp.bom_version_id
      JOIN products p ON p.id = bv.product_id
      WHERE pr.pcb_id = ${pcb.id}::uuid AND pp.deleted_at IS NULL AND p.deleted_at IS NULL
      LIMIT 1`;
    if (inUse.length) throw Errors.conflict("PCB is used in one or more products and cannot be deleted");

    // Cascade the soft-delete to the PCB's revisions and BOM lines, otherwise those
    // rows stay live and keep components/brands looking "in use" after the PCB is gone.
    await tx.$executeRaw`
      UPDATE pcb_lines SET deleted_at = now(), updated_by = ${ctx.userId}::uuid
      WHERE deleted_at IS NULL AND pcb_revision_id IN (
        SELECT id FROM pcb_revisions WHERE pcb_id = ${pcb.id}::uuid
      )`;
    await tx.$executeRaw`
      UPDATE pcb_revisions SET deleted_at = now(), updated_by = ${ctx.userId}::uuid
      WHERE deleted_at IS NULL AND pcb_id = ${pcb.id}::uuid`;
    await tx.pcbs.update({
      where: { id: pcb.id },
      data: { deleted_at: new Date(), updated_by: ctx.userId },
    });
    return { id: pcb.id, slug: pcb.slug };
  });
}

/**
 * Resolve the BOM for a PCB, optionally pinned to a specific revision. When
 * `revisionId` is omitted the caller sees the Active revision (the historical
 * behaviour) — passing a uuid returns THAT revision's lines instead, so the
 * structure page can flip between revisions without needing separate endpoints.
 */
export async function getPcbBom(idOrSlug: string, revisionId?: string): Promise<PcbBomLineView[]> {
  return guarded("pcb.view", async (tx) => {
    const id = await resolvePcbId(tx, idOrSlug);
    const revFilter = revisionId
      ? Prisma.sql`AND pr.id = ${revisionId}::uuid`
      : Prisma.sql`AND pr.status = 'Active'`;
    const rows = await tx.$queryRaw<{
      componentId: string; genericPN: string; componentName: string; category: string | null;
      unit: string; qty: number; refDes: string | null; preferredBrandId: string | null;
      preferredBrandName: string | null; remarks: string | null;
    }[]>`
      SELECT c.id AS "componentId", c.generic_pn AS "genericPN", c.name AS "componentName",
             c.category, c.unit, pl.qty::int AS qty, pl.ref_des AS "refDes",
             b.id AS "preferredBrandId", b.name AS "preferredBrandName", pl.remarks
      FROM pcb_revisions pr
      JOIN pcb_lines pl ON pl.pcb_revision_id = pr.id AND pl.deleted_at IS NULL
      JOIN components c ON c.id = pl.component_id AND c.deleted_at IS NULL
      LEFT JOIN brands b ON b.id = pl.preferred_brand_id AND b.deleted_at IS NULL
      WHERE pr.pcb_id = ${id}::uuid AND pr.deleted_at IS NULL ${revFilter}
      ORDER BY c.name`;
    return rows.map((r) => ({
      component: { id: r.componentId, genericPN: r.genericPN, name: r.componentName, category: r.category, unit: r.unit },
      qty: r.qty,
      refDes: r.refDes,
      preferredBrand: r.preferredBrandId ? { id: r.preferredBrandId, name: r.preferredBrandName ?? "" } : null,
      remarks: r.remarks,
    }));
  });
}

// ── PCB revisions ("division versions") ─────────────────────────────────────
export interface PcbRevisionView {
  id: string;
  rev: string;
  status: "Draft" | "Active" | "Superseded" | "Obsolete";
  effectiveFrom: string | null;
  effectiveTo: string | null;
  lineCount: number;
  usedByProductCount: number;
  createdAt: string;
}

export interface PcbRevisionProductUsage {
  revisionId: string;
  rev: string;
  productSlug: string;
  productName: string;
  productCode: string;
  qtyPerUnit: number;
}

/** List every revision for a PCB, newest first, with per-revision usage counts. */
export async function listPcbRevisions(idOrSlug: string): Promise<PcbRevisionView[]> {
  return guarded("pcb.view", async (tx) => {
    const id = await resolvePcbId(tx, idOrSlug);
    return tx.$queryRaw<PcbRevisionView[]>`
      SELECT pr.id, pr.rev, pr.status::text AS status,
             pr.effective_from::text AS "effectiveFrom",
             pr.effective_to::text AS "effectiveTo",
             (SELECT COUNT(*)::int FROM pcb_lines pl WHERE pl.pcb_revision_id = pr.id AND pl.deleted_at IS NULL) AS "lineCount",
             (SELECT COUNT(DISTINCT bv.product_id)::int
                FROM product_pcbs pp
                JOIN bom_versions bv ON bv.id = pp.bom_version_id AND bv.deleted_at IS NULL
                JOIN products p ON p.id = bv.product_id AND p.deleted_at IS NULL
                WHERE pp.pcb_revision_id = pr.id AND pp.deleted_at IS NULL) AS "usedByProductCount",
             pr.created_at::text AS "createdAt"
      FROM pcb_revisions pr
      WHERE pr.pcb_id = ${id}::uuid AND pr.deleted_at IS NULL
      ORDER BY pr.created_at DESC`;
  });
}

/** Which products use which revision — the mapping the user wants surfaced. */
export async function listPcbProductUsage(idOrSlug: string): Promise<PcbRevisionProductUsage[]> {
  return guarded("pcb.view", async (tx) => {
    const id = await resolvePcbId(tx, idOrSlug);
    return tx.$queryRaw<PcbRevisionProductUsage[]>`
      SELECT pr.id AS "revisionId", pr.rev,
             p.slug AS "productSlug", p.name AS "productName", p.code AS "productCode",
             pp.qty::int AS "qtyPerUnit"
      FROM pcb_revisions pr
      JOIN product_pcbs pp ON pp.pcb_revision_id = pr.id AND pp.deleted_at IS NULL
      JOIN bom_versions bv ON bv.id = pp.bom_version_id AND bv.status = 'Active' AND bv.deleted_at IS NULL
      JOIN products p ON p.id = bv.product_id AND p.deleted_at IS NULL
      WHERE pr.pcb_id = ${id}::uuid AND pr.deleted_at IS NULL
      ORDER BY p.name, pr.rev`;
  });
}

const REV_STATUSES = ["Draft", "Active", "Superseded", "Obsolete"] as const;
export type RevisionStatus = (typeof REV_STATUSES)[number];

export interface CreatePcbRevisionInput {
  rev: string;
  status?: RevisionStatus;
  /** Fresh BOM lines. Ignored if `cloneFromRevId` is set. */
  lines?: ResolveComponentLine[];
  /** When set, copies the source revision's BOM into the new one (a common workflow). */
  cloneFromRevId?: string;
  effectiveFrom?: string;
}

/**
 * Add a new revision to a PCB. If `status='Active'` any prior Active revision
 * for this PCB is demoted to `Superseded` (invariant: at most one Active).
 */
export async function createPcbRevision(idOrSlug: string, input: CreatePcbRevisionInput): Promise<PcbRevisionView> {
  return guarded("pcb.edit", async (tx, ctx) => {
    const pcbId = await resolvePcbId(tx, idOrSlug);
    const rev = input.rev.trim();
    if (!rev) throw Errors.badRequest("Revision label is required");
    const dupe = await tx.pcb_revisions.findFirst({ where: { pcb_id: pcbId, rev, deleted_at: null }, select: { id: true } });
    if (dupe) throw Errors.conflict("A revision with this label already exists on this PCB", { rev });

    const status: RevisionStatus = input.status ?? "Draft";
    const audit = { company_id: ctx.companyId!, created_by: ctx.userId, updated_by: ctx.userId };

    // Demote any currently-Active revision on this PCB before promoting this one.
    if (status === "Active") {
      await tx.pcb_revisions.updateMany({
        where: { pcb_id: pcbId, status: "Active", deleted_at: null },
        data: { status: "Superseded", updated_by: ctx.userId, updated_at: new Date() },
      });
    }

    const newRev = await tx.pcb_revisions.create({
      data: {
        ...audit, pcb_id: pcbId, rev, status,
        effective_from: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
      },
      select: { id: true },
    });

    // Populate the BOM — either by cloning a source revision or from fresh lines.
    if (input.cloneFromRevId) {
      const source = await tx.pcb_revisions.findFirst({
        where: { id: input.cloneFromRevId, pcb_id: pcbId, deleted_at: null }, select: { id: true },
      });
      if (!source) throw Errors.badRequest("Source revision to clone from does not belong to this PCB");
      await tx.$executeRaw`
        INSERT INTO pcb_lines (company_id, pcb_revision_id, component_id, qty, ref_des, preferred_brand_id, remarks, created_by, updated_by)
        SELECT ${ctx.companyId!}::uuid, ${newRev.id}::uuid, component_id, qty, ref_des, preferred_brand_id, remarks, ${ctx.userId}::uuid, ${ctx.userId}::uuid
        FROM pcb_lines
        WHERE pcb_revision_id = ${source.id}::uuid AND deleted_at IS NULL`;
    } else if (input.lines?.length) {
      const filtered = input.lines.filter(lineHasContent);
      const qtyByComponent = new Map<string, number>();
      for (const line of filtered) {
        const componentId = await resolveOrCreateComponent(tx, ctx, line);
        const qty = Math.max(1, Math.round(Number(line.qty) || 1));
        qtyByComponent.set(componentId, (qtyByComponent.get(componentId) ?? 0) + qty);
      }
      for (const [componentId, qty] of qtyByComponent) {
        await tx.pcb_lines.create({ data: { ...audit, pcb_revision_id: newRev.id, component_id: componentId, qty } });
      }
    }

    const [view] = await listPcbRevisionsById(tx, pcbId, newRev.id);
    if (!view) throw Errors.notFound("Revision");
    return view;
  });
}

async function listPcbRevisionsById(tx: TxClient, pcbId: string, revId: string): Promise<PcbRevisionView[]> {
  return tx.$queryRaw<PcbRevisionView[]>`
    SELECT pr.id, pr.rev, pr.status::text AS status,
           pr.effective_from::text AS "effectiveFrom", pr.effective_to::text AS "effectiveTo",
           (SELECT COUNT(*)::int FROM pcb_lines pl WHERE pl.pcb_revision_id = pr.id AND pl.deleted_at IS NULL) AS "lineCount",
           (SELECT COUNT(DISTINCT bv.product_id)::int FROM product_pcbs pp
              JOIN bom_versions bv ON bv.id = pp.bom_version_id AND bv.deleted_at IS NULL
              JOIN products p ON p.id = bv.product_id AND p.deleted_at IS NULL
              WHERE pp.pcb_revision_id = pr.id AND pp.deleted_at IS NULL) AS "usedByProductCount",
           pr.created_at::text AS "createdAt"
    FROM pcb_revisions pr
    WHERE pr.pcb_id = ${pcbId}::uuid AND pr.id = ${revId}::uuid`;
}

export interface UpdatePcbRevisionInput {
  rev?: string;
  status?: RevisionStatus;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  /**
   * When provided, REPLACES this revision's BOM (same shape as CreatePcbLine).
   * Each line links an existing component by generic_pn / part number, or is
   * created on the fly via resolveOrCreateComponent.
   */
  lines?: ResolveComponentLine[];
}

/** Edit a revision's label / status / effective window / BOM lines. Promoting to Active demotes any prior Active. */
export async function updatePcbRevision(idOrSlug: string, revId: string, patch: UpdatePcbRevisionInput): Promise<PcbRevisionView> {
  return guarded("pcb.edit", async (tx, ctx) => {
    if (!isUuid(revId)) throw Errors.notFound("Revision");
    const pcbId = await resolvePcbId(tx, idOrSlug);
    const existing = await tx.pcb_revisions.findFirst({
      where: { id: revId, pcb_id: pcbId, deleted_at: null },
      select: { id: true, rev: true, status: true },
    });
    if (!existing) throw Errors.notFound("Revision");

    if (patch.rev !== undefined) {
      const rev = patch.rev.trim();
      if (!rev) throw Errors.badRequest("Revision label cannot be empty");
      if (rev !== existing.rev) {
        const dupe = await tx.pcb_revisions.findFirst({
          where: { pcb_id: pcbId, rev, deleted_at: null, id: { not: revId } }, select: { id: true },
        });
        if (dupe) throw Errors.conflict("A revision with this label already exists on this PCB", { rev });
      }
    }

    // Promoting to Active → demote any current Active first (invariant: at most one).
    if (patch.status === "Active" && existing.status !== "Active") {
      await tx.pcb_revisions.updateMany({
        where: { pcb_id: pcbId, status: "Active", deleted_at: null, id: { not: revId } },
        data: { status: "Superseded", updated_by: ctx.userId, updated_at: new Date() },
      });
    }

    await tx.pcb_revisions.update({
      where: { id: revId },
      data: {
        updated_by: ctx.userId, updated_at: new Date(),
        ...(patch.rev !== undefined ? { rev: patch.rev.trim() } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.effectiveFrom !== undefined ? { effective_from: patch.effectiveFrom ? new Date(patch.effectiveFrom) : null } : {}),
        ...(patch.effectiveTo !== undefined ? { effective_to: patch.effectiveTo ? new Date(patch.effectiveTo) : null } : {}),
      },
    });

    // Replace the revision's BOM if `lines` was provided. Soft-delete the
    // existing lines first, then insert the new set (component resolved by
    // generic_pn / MPN, aggregated per-component so each board's BOM stays
    // one row per component). An empty `lines: []` is a valid "clear the BOM"
    // request; skip when `lines` is undefined to allow header-only updates.
    if (patch.lines !== undefined) {
      const audit = { company_id: ctx.companyId!, created_by: ctx.userId, updated_by: ctx.userId };
      await tx.pcb_lines.updateMany({
        where: { pcb_revision_id: revId, deleted_at: null },
        data: { deleted_at: new Date(), updated_by: ctx.userId },
      });
      const filtered = patch.lines.filter(lineHasContent);
      const qtyByComponent = new Map<string, number>();
      for (const line of filtered) {
        const componentId = await resolveOrCreateComponent(tx, ctx, line);
        const qty = Math.max(1, Math.round(Number(line.qty) || 1));
        qtyByComponent.set(componentId, (qtyByComponent.get(componentId) ?? 0) + qty);
      }
      for (const [componentId, qty] of qtyByComponent) {
        await tx.pcb_lines.create({ data: { ...audit, pcb_revision_id: revId, component_id: componentId, qty } });
      }
    }

    const [view] = await listPcbRevisionsById(tx, pcbId, revId);
    if (!view) throw Errors.notFound("Revision");
    return view;
  });
}

/**
 * Soft-delete a revision. Blocked if any product's active BOM version references
 * it, or if it's the last remaining revision on the PCB.
 */
export async function deletePcbRevision(idOrSlug: string, revId: string): Promise<{ id: string; rev: string }> {
  return guarded("pcb.edit", async (tx, ctx) => {
    if (!isUuid(revId)) throw Errors.notFound("Revision");
    const pcbId = await resolvePcbId(tx, idOrSlug);
    const existing = await tx.pcb_revisions.findFirst({
      where: { id: revId, pcb_id: pcbId, deleted_at: null },
      select: { id: true, rev: true },
    });
    if (!existing) throw Errors.notFound("Revision");

    const siblings = await tx.pcb_revisions.count({ where: { pcb_id: pcbId, deleted_at: null, id: { not: revId } } });
    if (siblings === 0) throw Errors.conflict(
      "Cannot delete the last revision of a PCB",
      undefined,
      "Delete the PCB itself, or add another revision before removing this one.",
    );

    const inUse = await tx.$queryRaw<{ one: number }[]>`
      SELECT 1 AS one FROM product_pcbs pp
      JOIN bom_versions bv ON bv.id = pp.bom_version_id AND bv.deleted_at IS NULL
      JOIN products p ON p.id = bv.product_id AND p.deleted_at IS NULL
      WHERE pp.pcb_revision_id = ${revId}::uuid AND pp.deleted_at IS NULL LIMIT 1`;
    if (inUse.length) throw Errors.conflict(
      "Revision is pinned by one or more products and cannot be deleted",
      undefined,
      "Repoint each product to a different revision first, then retry.",
    );

    // Cascade the soft-delete to the revision's BOM lines.
    await tx.$executeRaw`
      UPDATE pcb_lines SET deleted_at = now(), updated_by = ${ctx.userId}::uuid
      WHERE pcb_revision_id = ${revId}::uuid AND deleted_at IS NULL`;
    await tx.pcb_revisions.update({ where: { id: revId }, data: { deleted_at: new Date(), updated_by: ctx.userId } });
    return { id: revId, rev: existing.rev };
  });
}
