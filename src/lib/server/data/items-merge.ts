/**
 * Duplicate detection + merge for raw items.
 *
 * BOM imports intentionally leave duplicate-creation on for rows that carry
 * no Part Number — merging by name across imports would collapse genuinely
 * distinct mechanical/packaging parts. This module gives the user a
 * post-import cleanup surface instead: list clusters that LOOK like
 * duplicates, then let the user merge them one at a time after inspecting
 * the match reasons.
 *
 * Scope: raw items only (assembled / semi-assembled duplicates are
 * user-authored parents; merging them silently would wreck BOM version
 * history). The `guarded` helper enforces tenant + permission.
 */

import { withTenant, type TenantContext, type TxClient } from "@/lib/prisma";
import { requireSession } from "@/lib/server/session";
import { assertPermission } from "@/lib/server/rbac";
import { Errors } from "@/lib/server/http";
import { isUuid } from "@/lib/server/data/util";

/** Concatenate refDes strings when consolidating two BOM lines that point at
 *  the same physical part. Preserves order, drops exact-token duplicates.
 *  Mirrors bom-import.ts:mergeRefDes so a hand-triggered merge behaves the
 *  same as an importer-triggered in-batch merge. */
function mergeRefDes(existing: string | null, incoming: string | null): string | null {
  const tokens = new Set<string>();
  const push = (s: string | null) => {
    if (!s) return;
    for (const t of s.split(/[,\s]+/)) {
      const clean = t.trim();
      if (clean) tokens.add(clean);
    }
  };
  push(existing);
  push(incoming);
  return tokens.size === 0 ? null : Array.from(tokens).join(", ");
}

async function guarded<T>(
  perm: string,
  fn: (tx: TxClient, ctx: TenantContext) => Promise<T>,
): Promise<T> {
  const ctx = await requireSession();
  return withTenant(ctx, async (tx) => {
    await assertPermission(tx, ctx, perm);
    return fn(tx, ctx);
  });
}

// ── Detection ────────────────────────────────────────────────────────────────

export interface DuplicateItemInfo {
  id: string;
  code: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  footprint: string | null;
  solderType: "SMD" | "DIP" | null;
  createdAt: string;
  variantCount: number;
  bomLineCount: number;
  onHand: number;
}

export interface DuplicateCluster {
  /** Key that grouped these items (lower-cased trimmed name). */
  clusterKey: string;
  items: DuplicateItemInfo[];
  /** Per-cluster reasons that apply to EVERY member (so the UI can badge
   *  the whole cluster with the invariants it shares). */
  sharedReasons: Array<"name" | "footprint" | "solderType" | "category" | "description">;
}

export async function listDuplicateClusters(): Promise<{ clusters: DuplicateCluster[]; totalItemsScanned: number }> {
  return guarded("component.view", async (tx, ctx) => {
    // Pull every raw item's identity + derived counts. Volumes here are the
    // catalog size — a few thousand at most for the tenants we target — so
    // one query with in-memory grouping is fine.
    const rows = await tx.$queryRaw<{
      id: string;
      code: string;
      name: string;
      description: string | null;
      categoryId: string | null;
      categoryName: string | null;
      footprint: string | null;
      solderType: string | null;
      createdAt: string;
      variantCount: number;
      bomLineCount: number;
      onHand: number;
    }[]>`
      SELECT
        i.id,
        i.code,
        i.name,
        i.description,
        i.category_id AS "categoryId",
        (SELECT ic.name FROM item_categories ic WHERE ic.id = i.category_id) AS "categoryName",
        i.footprint,
        i.solder_type::text AS "solderType",
        to_char(i.created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS "createdAt",
        (SELECT COUNT(*)::int FROM item_variants v WHERE v.item_id = i.id AND v.deleted_at IS NULL) AS "variantCount",
        (SELECT COUNT(*)::int FROM item_bom_lines bl WHERE bl.child_item_id = i.id AND bl.deleted_at IS NULL) AS "bomLineCount",
        COALESCE((
          SELECT SUM(ib.on_hand)::float8
            FROM inventory_balances ib
            JOIN item_variants v ON v.id = ib.item_variant_id AND v.deleted_at IS NULL
           WHERE v.item_id = i.id AND ib.deleted_at IS NULL
        ), 0) AS "onHand"
      FROM items i
      WHERE i.company_id = ${ctx.companyId!}::uuid
        AND i.deleted_at IS NULL
        AND i.item_type = 'raw'::item_type
      ORDER BY LOWER(TRIM(i.name)), i.created_at`;

    // Group by lower-trimmed name.
    const byName = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = r.name.trim().toLowerCase();
      if (!key) continue;
      const arr = byName.get(key);
      if (arr) arr.push(r);
      else byName.set(key, [r]);
    }

    const clusters: DuplicateCluster[] = [];
    for (const [clusterKey, members] of byName) {
      if (members.length < 2) continue;

      // Compute which reasons apply to EVERY member (cluster-wide invariants).
      const first = members[0];
      const allSameFootprint = members.every((m) => (m.footprint ?? "").trim().toLowerCase() === (first.footprint ?? "").trim().toLowerCase());
      const allSameSolder = members.every((m) => (m.solderType ?? null) === (first.solderType ?? null));
      const allSameCategory = members.every((m) => (m.categoryId ?? null) === (first.categoryId ?? null));
      const allSameDescription = members.every((m) => (m.description ?? "").trim().toLowerCase() === (first.description ?? "").trim().toLowerCase());

      const sharedReasons: DuplicateCluster["sharedReasons"] = ["name"];
      if (allSameFootprint) sharedReasons.push("footprint");
      if (allSameSolder) sharedReasons.push("solderType");
      if (allSameCategory) sharedReasons.push("category");
      if (allSameDescription && (first.description ?? "").trim() !== "") sharedReasons.push("description");

      clusters.push({
        clusterKey,
        sharedReasons,
        items: members.map((m) => ({
          id: m.id,
          code: m.code,
          name: m.name,
          description: m.description,
          categoryId: m.categoryId,
          categoryName: m.categoryName,
          footprint: m.footprint,
          solderType: (m.solderType === "SMD" || m.solderType === "DIP") ? m.solderType : null,
          createdAt: m.createdAt,
          variantCount: Number(m.variantCount ?? 0),
          bomLineCount: Number(m.bomLineCount ?? 0),
          onHand: Number(m.onHand ?? 0),
        })),
      });
    }

    // Sort: bigger, riskier-to-keep clusters first (most members, then most
    // BOM references summed across members).
    clusters.sort((a, b) => {
      if (b.items.length !== a.items.length) return b.items.length - a.items.length;
      const bomsA = a.items.reduce((n, i) => n + i.bomLineCount, 0);
      const bomsB = b.items.reduce((n, i) => n + i.bomLineCount, 0);
      return bomsB - bomsA;
    });

    return { clusters, totalItemsScanned: rows.length };
  });
}

// ── Merge ────────────────────────────────────────────────────────────────────

export interface MergeItemsResult {
  keptId: string;
  discardedId: string;
  variantsMoved: number;
  variantsCollapsed: number;
  bomLinesRelinked: number;
  /** Subset of `bomLinesRelinked` that landed on a BOM version which already
   *  had a kept-item line — the two lines were consolidated (qty summed,
   *  refDes concatenated) instead of a straight FK repoint. */
  bomLinesConsolidated: number;
  lotsMoved: number;
}

/** Merge `discardId` into `keepId`. Both must be raw items in the same
 *  tenant. All references (BOM lines, variants → inventory + lots) move to
 *  `keepId`; the discarded item is soft-deleted. */
export async function mergeItems(input: { keepId: string; discardId: string }): Promise<MergeItemsResult> {
  return guarded("component.delete", async (tx, ctx) => {
    const { keepId, discardId } = input;
    if (!isUuid(keepId) || !isUuid(discardId)) {
      throw Errors.badRequest("Invalid item id");
    }
    if (keepId === discardId) {
      throw Errors.badRequest("Cannot merge an item into itself");
    }

    // Load both and validate.
    const pair = await tx.$queryRaw<{ id: string; itemType: string; name: string; code: string }[]>`
      SELECT id, item_type::text AS "itemType", name, code
        FROM items
       WHERE id IN (${keepId}::uuid, ${discardId}::uuid)
         AND company_id = ${ctx.companyId!}::uuid
         AND deleted_at IS NULL`;
    if (pair.length !== 2) throw Errors.notFound("Item");
    const keep = pair.find((p) => p.id === keepId)!;
    const discard = pair.find((p) => p.id === discardId)!;
    if (keep.itemType !== "raw" || discard.itemType !== "raw") {
      throw Errors.badRequest("Merge is available for raw items only", { keepType: keep.itemType, discardType: discard.itemType });
    }

    // 1) Variants. For each variant on `discard`, check whether `keep` already
    //    has a (brand, source_kind) match: if so, soft-delete the discard's
    //    variant (its inventory/lots stay attached but on a soft-deleted
    //    variant — they're inaccessible via the item, which is what we want
    //    for a merged/collapsed variant); otherwise re-point item_id.
    let variantsMoved = 0;
    let variantsCollapsed = 0;
    const discardVariants = await tx.$queryRaw<{ id: string; brandId: string; sourceKind: string; isDefault: boolean }[]>`
      SELECT id, brand_id AS "brandId", source_kind::text AS "sourceKind", is_default AS "isDefault"
        FROM item_variants
       WHERE item_id = ${discardId}::uuid AND deleted_at IS NULL`;
    for (const v of discardVariants) {
      const collision = await tx.$queryRaw<{ id: string }[]>`
        SELECT id
          FROM item_variants
         WHERE item_id = ${keepId}::uuid
           AND brand_id = ${v.brandId}::uuid
           AND source_kind = ${v.sourceKind}::item_variant_source
           AND deleted_at IS NULL
         LIMIT 1`;
      if (collision[0]) {
        // Same brand exists on both sides. Move the ledger references (lots
        // + balances) from the discarded variant onto the kept one BEFORE
        // soft-deleting, so no on-hand stock gets stranded on a hidden row.
        const targetVariantId = collision[0].id;
        await tx.$executeRaw`
          UPDATE item_lots
             SET item_variant_id = ${targetVariantId}::uuid,
                 updated_by = ${ctx.userId}::uuid,
                 updated_at = now()
           WHERE item_variant_id = ${v.id}::uuid AND deleted_at IS NULL`;
        await tx.$executeRaw`
          UPDATE inventory_balances
             SET item_variant_id = ${targetVariantId}::uuid,
                 updated_by = ${ctx.userId}::uuid,
                 updated_at = now()
           WHERE item_variant_id = ${v.id}::uuid AND deleted_at IS NULL`;
        await tx.$executeRaw`
          UPDATE item_variants
             SET deleted_at = now(), updated_by = ${ctx.userId}::uuid
           WHERE id = ${v.id}::uuid`;
        variantsCollapsed++;
      } else {
        // Move it. Default handling: if keep already has a default and this
        // variant was flagged default, drop the flag on the moved row so we
        // don't violate the "one default per item" convention.
        const hasDefault = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM item_variants
           WHERE item_id = ${keepId}::uuid AND is_default = true AND deleted_at IS NULL
           LIMIT 1`;
        const nextIsDefault = v.isDefault && hasDefault.length === 0;
        await tx.$executeRaw`
          UPDATE item_variants
             SET item_id = ${keepId}::uuid,
                 is_default = ${nextIsDefault},
                 updated_by = ${ctx.userId}::uuid,
                 updated_at = now()
           WHERE id = ${v.id}::uuid`;
        variantsMoved++;
      }
    }

    // Inventory balances and lots key on item_variant_id — they follow the
    // variant automatically when we re-point item_id above, so no separate
    // move is needed. Count lots that ended up under a moved variant for
    // the summary line.
    const lotsMoved = (await tx.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n
        FROM item_lots l
        JOIN item_variants v ON v.id = l.item_variant_id
       WHERE v.item_id = ${keepId}::uuid AND l.deleted_at IS NULL
    `)[0]?.n ?? 0;

    // 2) BOM lines — relink every reference to the kept item.
    //    The DB enforces (bom_version_id, child_item_id) uniqueness, so a
    //    plain UPDATE would fail whenever a BOM version already lists BOTH
    //    the kept item AND the discarded item as separate lines. First
    //    consolidate those collisions: sum qty into the kept line, merge
    //    refDes strings (same helper the importer uses within a batch),
    //    then soft-delete the discard's line so the UPDATE below sees no
    //    collision.
    const collisions = await tx.$queryRaw<{
      keepLineId: string; discardLineId: string;
      keepQty: number; discardQty: number;
      keepRefDes: string | null; discardRefDes: string | null;
    }[]>`
      SELECT
        kl.id  AS "keepLineId",
        dl.id  AS "discardLineId",
        kl.qty::float8      AS "keepQty",
        dl.qty::float8      AS "discardQty",
        kl.ref_des          AS "keepRefDes",
        dl.ref_des          AS "discardRefDes"
      FROM item_bom_lines dl
      JOIN item_bom_lines kl
        ON kl.bom_version_id = dl.bom_version_id
       AND kl.child_item_id  = ${keepId}::uuid
       AND kl.deleted_at IS NULL
      WHERE dl.child_item_id = ${discardId}::uuid
        AND dl.deleted_at IS NULL`;
    let bomLinesConsolidated = 0;
    for (const c of collisions) {
      const mergedRefDes = mergeRefDes(c.keepRefDes, c.discardRefDes);
      await tx.$executeRaw`
        UPDATE item_bom_lines
           SET qty = ${c.keepQty + c.discardQty},
               ref_des = ${mergedRefDes},
               updated_by = ${ctx.userId}::uuid,
               updated_at = now()
         WHERE id = ${c.keepLineId}::uuid`;
      await tx.$executeRaw`
        UPDATE item_bom_lines
           SET deleted_at = now(), updated_by = ${ctx.userId}::uuid
         WHERE id = ${c.discardLineId}::uuid`;
      bomLinesConsolidated++;
    }
    // Now the safe re-link: every remaining discardId row has no keepId
    // sibling in its BOM version, so the unique constraint won't fire.
    const relink = await tx.$executeRaw`
      UPDATE item_bom_lines
         SET child_item_id = ${keepId}::uuid,
             updated_by = ${ctx.userId}::uuid,
             updated_at = now()
       WHERE child_item_id = ${discardId}::uuid
         AND deleted_at IS NULL`;
    const bomLinesRelinked = Number(relink ?? 0) + bomLinesConsolidated;

    // 3) Soft-delete the discarded item.
    await tx.$executeRaw`
      UPDATE items
         SET deleted_at = now(), updated_by = ${ctx.userId}::uuid
       WHERE id = ${discardId}::uuid`;

    return {
      keptId: keepId,
      discardedId: discardId,
      variantsMoved,
      variantsCollapsed,
      bomLinesRelinked,
      bomLinesConsolidated,
      lotsMoved,
    };
  });
}
