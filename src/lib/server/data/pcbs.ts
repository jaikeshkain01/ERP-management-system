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

export async function getPcbBom(idOrSlug: string): Promise<PcbBomLineView[]> {
  return guarded("pcb.view", async (tx) => {
    const id = await resolvePcbId(tx, idOrSlug);
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
      WHERE pr.pcb_id = ${id}::uuid AND pr.status = 'Active' AND pr.deleted_at IS NULL
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
