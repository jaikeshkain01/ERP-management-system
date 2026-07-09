/**
 * PCBs data access (mock/DB). Endpoints: list (with BOM totals + used-in),
 * detail, and resolved BOM. DB mode resolves through the Active pcb_revision
 * (the versioning layer the mock doesn't have — see ARCHITECTURE.md §7d).
 */
import { Prisma } from "@/generated/prisma/client";
import { isTesting } from "@/lib/config";
import { withTenant, type TenantContext, type TxClient } from "@/lib/prisma";
import { Errors } from "@/lib/server/http";
import { assertPermission } from "@/lib/server/rbac";
import { requireSession } from "@/lib/server/session";
import { isUuid } from "@/lib/server/data/util";
import {
  PCBS,
  getPcb,
  getBrandName,
  pcbBom as mockPcbBom,
  pcbTotalParts,
  pcbUsedInLabels,
} from "@/mockdata";

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
  if (isTesting) {
    return PCBS.map(mockPcbView).sort((a, b) => a.name.localeCompare(b.name));
  }
  return guarded("pcb.view", (tx) => pcbAggregate(tx));
}

export async function getPcbDetail(idOrSlug: string): Promise<PcbView> {
  if (isTesting) {
    const p = getPcb(idOrSlug);
    if (!p) throw Errors.notFound("PCB");
    return mockPcbView(p);
  }
  return guarded("pcb.view", async (tx) => {
    const id = await resolvePcbId(tx, idOrSlug);
    const rows = await pcbAggregate(tx, id);
    if (!rows.length) throw Errors.notFound("PCB");
    return rows[0];
  });
}

export async function getPcbBom(idOrSlug: string): Promise<PcbBomLineView[]> {
  if (isTesting) {
    const p = getPcb(idOrSlug);
    if (!p) throw Errors.notFound("PCB");
    return mockPcbBom(p).map((l) => ({
      component: {
        id: l.component.id, genericPN: l.component.genericPN, name: l.component.name,
        category: l.component.category, unit: l.component.unit,
      },
      qty: l.qty,
      refDes: l.refDes ?? null,
      preferredBrand: l.preferredBrandId ? { id: l.preferredBrandId, name: getBrandName(l.preferredBrandId) } : null,
      remarks: l.remarks ?? null,
    }));
  }
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

function mockPcbView(p: (typeof PCBS)[number]): PcbView {
  return {
    id: p.id, slug: p.id, name: p.name, description: p.description, layers: p.layers, status: p.status,
    lineCount: p.lines.length, totalParts: pcbTotalParts(p), usedInProducts: pcbUsedInLabels(p.id),
  };
}
