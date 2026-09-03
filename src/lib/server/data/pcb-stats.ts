/**
 * Per-item stats for the Semi-assembled workspace (/pcb-management/list).
 *
 * The module owns this endpoint. Assembled Products and the universal items
 * list have their own signals; semi-assembled cards care about revision
 * history and where-used, so they get a scoped stats payload instead of
 * bloating the shared /api/items response.
 *
 * Payload per semi_assembled item:
 *   • bomVersions — every version on the item (label, status, line count)
 *   • usedIn      — assembled parents whose Active or Draft BOM lists this
 *                   item as a direct child (up to 5 for card display)
 *   • usedInCount — total parents (not clipped) so the card can show +N
 */

import { Prisma } from "@/generated/prisma/client";
import { withTenant, type TxClient, type TenantContext } from "@/lib/prisma";
import { requireSession } from "@/lib/server/session";
import { assertPermission } from "@/lib/server/rbac";

async function guarded<T>(perm: string, fn: (tx: TxClient, ctx: TenantContext) => Promise<T>): Promise<T> {
  const ctx = await requireSession();
  return withTenant(ctx, async (tx) => {
    await assertPermission(tx, ctx, perm);
    return fn(tx, ctx);
  });
}

export interface PcbBomVersionSummary {
  id: string;
  version: string;
  status: string;
  lineCount: number;
}

export interface PcbParentSummary {
  id: string;
  code: string;
  name: string;
}

export interface SemiAssembledStats {
  itemId: string;
  bomVersions: PcbBomVersionSummary[];
  usedIn: PcbParentSummary[];
  usedInCount: number;
}

export async function getSemiAssembledStats(): Promise<SemiAssembledStats[]> {
  return guarded("item.view", async (tx, ctx) => {
    // 1) Every semi-assembled item's BOM versions with per-version line count.
    //    A single scan across all semi_assembled parents keeps this bounded
    //    by (assemblies × versions) — small in practice.
    const versions = await tx.$queryRaw<{
      itemId: string; id: string; version: string; status: string; lineCount: number;
    }[]>`
      SELECT bv.parent_item_id                 AS "itemId",
             bv.id                             AS "id",
             bv.version                        AS "version",
             bv.status::text                   AS "status",
             (SELECT COUNT(*)::int
                FROM item_bom_lines bl
               WHERE bl.bom_version_id = bv.id AND bl.deleted_at IS NULL) AS "lineCount"
        FROM item_bom_versions bv
        JOIN items i ON i.id = bv.parent_item_id
       WHERE i.company_id = ${ctx.companyId!}::uuid
         AND i.deleted_at IS NULL
         AND i.item_type = 'semi_assembled'::item_type
         AND bv.deleted_at IS NULL
       ORDER BY (bv.status = 'Active') DESC, bv.created_at DESC`;

    // 2) Where-used: parents whose Active or Draft BOM lists any of these
    //    semi_assembled items as a direct child. DISTINCT because two
    //    versions of the same parent counting a child would double-count.
    //    Clipped to itemIds we care about — semi_assembled catalog only.
    const parents = await tx.$queryRaw<{
      childId: string; parentId: string; parentCode: string; parentName: string;
    }[]>`
      SELECT DISTINCT
        bl.child_item_id  AS "childId",
        p.id              AS "parentId",
        p.code            AS "parentCode",
        p.name            AS "parentName"
        FROM item_bom_lines bl
        JOIN item_bom_versions bv ON bv.id = bl.bom_version_id AND bv.deleted_at IS NULL
        JOIN items p               ON p.id  = bv.parent_item_id AND p.deleted_at IS NULL
        JOIN items c               ON c.id  = bl.child_item_id  AND c.deleted_at IS NULL
       WHERE bl.deleted_at IS NULL
         AND bv.status IN ('Active'::bom_status, 'Draft'::bom_status)
         AND c.company_id = ${ctx.companyId!}::uuid
         AND c.item_type = 'semi_assembled'::item_type
       ORDER BY p.name ASC`;

    // Fold into per-child aggregates.
    const versionsByChild = new Map<string, PcbBomVersionSummary[]>();
    for (const v of versions) {
      const arr = versionsByChild.get(v.itemId) ?? [];
      arr.push({ id: v.id, version: v.version, status: v.status, lineCount: v.lineCount });
      versionsByChild.set(v.itemId, arr);
    }
    const parentsByChild = new Map<string, PcbParentSummary[]>();
    for (const p of parents) {
      const arr = parentsByChild.get(p.childId) ?? [];
      arr.push({ id: p.parentId, code: p.parentCode, name: p.parentName });
      parentsByChild.set(p.childId, arr);
    }

    // Emit rows for every item that has ANY signal (either a version or a
    // parent). Items without either aren't returned; the client treats
    // missing as "fresh item, no BOM, no parents yet".
    const allItemIds = new Set<string>([...versionsByChild.keys(), ...parentsByChild.keys()]);
    return Array.from(allItemIds).map<SemiAssembledStats>((itemId) => {
      const p = parentsByChild.get(itemId) ?? [];
      return {
        itemId,
        bomVersions: versionsByChild.get(itemId) ?? [],
        usedIn: p.slice(0, 5),
        usedInCount: p.length,
      };
    });
  });
}
