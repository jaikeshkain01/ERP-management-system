/**
 * BOM importer (Slice B of the spreadsheet-import workstream).
 *
 * Ingests parsed spreadsheet rows for ONE parent item and materialises them as
 * a Draft BOM version on that parent, upserting brands, suppliers, child items
 * and variants along the way. The client-side importer (Slice C/D) parses the
 * workbook, presents a preview, and posts here with the resolved column
 * mappings — this function does NOT know about xlsx.
 *
 * Rules (locked in via memory/project_bom_importer.md):
 *   • One physical part is one (brand, part_no) tuple. Dedup key across rows AND
 *     across imports — a resistor already in the catalog under Yageo/RC0603FR-0710KL
 *     is reused, never re-created.
 *   • Missing manufacturer → placeholder brand slug 'no-manufacturer' (seeded
 *     by 20260827000003).
 *   • Missing part number → auto-generated 'AUTO-{itemCode}'.
 *   • Missing supplier → child item's default_supplier_id left NULL. When
 *     present, upsert-by-name; set default_supplier_id on the child only when
 *     the child is being CREATED (never overwrites an existing item's preferred
 *     supplier — the earlier decision wins).
 *   • Row-level failures are lenient: bad rows land in `skipped`, the rest
 *     proceed. The whole import only aborts if zero rows survive OR the parent
 *     already carries a Draft (uncommitted state must be resolved first).
 *   • Duplicate designators / duplicate child items across rows are merged —
 *     qty summed, refDes concatenated (comma-joined, deduped, order preserved).
 */
import { withTenant, type TenantContext, type TxClient } from "@/lib/prisma";
import { Errors } from "@/lib/server/http";
import { assertPermission } from "@/lib/server/rbac";
import { requireSession } from "@/lib/server/session";
import { isUuid, resolveOrCreateBrand, resolveOrCreateSupplier } from "@/lib/server/data/util";

// ── input / output shapes ──────────────────────────────────────────────────
export interface BomImportRow {
  /** Child item's display name — required. Blank rows are skipped. */
  name: string;
  /** Manufacturer part number. When missing, the importer auto-generates one. */
  partNo?: string | null;
  /** Manufacturer / brand name. Case-insensitive upsert. When missing, the
   *  placeholder 'no-manufacturer' brand is used. */
  manufacturer?: string | null;
  /** Supplier name. Case-insensitive upsert. Only lands on the child item
   *  when we CREATE it — existing items keep their prior preferred supplier. */
  supplier?: string | null;
  /** Reference designator string as it appears in the sheet. Copied verbatim. */
  designator?: string | null;
  /** SMD / DIP. Set only on child-item creation. */
  solderType?: "SMD" | "DIP" | null;
  /** Footprint label. Set only on child-item creation. */
  footprint?: string | null;
  /** BOM line quantity. Must be a finite positive number or the row is skipped. */
  qty: number;
  /** Optional category to file the child under when we CREATE it. */
  categoryId?: string | null;
}

export interface BomImportInput {
  rows: BomImportRow[];
  /** Optional label naming the source of this import (e.g. sheet name).
   *  Used only in warning text today; will be persisted alongside the item
   *  when the `items.import_source` column lands. */
  sourceLabel?: string;
  /** `'create'` (default) — creates a fresh Draft version; refuses when the
   *  parent already carries one. `'append'` — finds the parent's existing
   *  Draft and folds the new rows into it, merging qty and refDes on any
   *  child already present. Used by the client's chunked import for large
   *  sheets: the first batch creates the Draft, subsequent batches append. */
  mode?: "create" | "append";
}

export interface BomImportResult {
  parentItemId: string;
  bomVersionId: string;
  linesCreated: number;
  itemsCreated: number;
  itemsMatched: number;
  brandsCreated: number;
  suppliersCreated: number;
  variantsCreated: number;
  warnings: string[];
  skipped: { rowIndex: number; reason: string }[];
}

// ── helpers ────────────────────────────────────────────────────────────────
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

/** Locate the tenant's placeholder brand (seeded by 20260827000003). Falls
 *  back to on-the-fly creation if a tenant somehow missed the seed migration
 *  — cheaper to self-heal than to 500 the whole import. */
async function ensureNoManufacturerBrand(tx: TxClient, ctx: TenantContext): Promise<string> {
  const existing = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM brands
     WHERE company_id = ${ctx.companyId!}::uuid
       AND slug = 'no-manufacturer'
       AND deleted_at IS NULL
     LIMIT 1`;
  if (existing[0]) return existing[0].id;
  const inserted = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO brands (company_id, slug, name, description, status, created_by, updated_by)
    VALUES (
      ${ctx.companyId!}::uuid, 'no-manufacturer', 'No Manufacturer',
      'Placeholder brand for imported parts with no manufacturer specified.',
      'Approved'::brand_status,
      ${ctx.userId}::uuid, ${ctx.userId}::uuid
    )
    RETURNING id`;
  return inserted[0].id;
}

/** Suggest an item code from a display name. Matches the shape used elsewhere
 *  in the app (`suggestCode` in the item form) so imported and hand-added
 *  items look the same in listings. Uppercase; keeps letters/digits + '-'. */
function suggestItemCode(name: string): string {
  const namePart = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
  return namePart ? `RAW-${namePart}` : "";
}

/** Pick a globally-unique code for this tenant: `base`, `base-2`, `base-3`, …
 *  Base is expected already normalised. Cheap while items are small. */
async function pickUniqueItemCode(tx: TxClient, ctx: TenantContext, base: string): Promise<string> {
  let candidate = base;
  let n = 2;
  // Small loop — a handful of DB round-trips at most. If the tenant has a
  // pathological number of same-name items this still terminates because n
  // grows unboundedly.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const hit = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM items
       WHERE company_id = ${ctx.companyId!}::uuid
         AND code = ${candidate}
         AND deleted_at IS NULL
       LIMIT 1`;
    if (!hit[0]) return candidate;
    candidate = `${base}-${n++}`;
  }
}

/** Find an item already owning a purchased variant with this (brand, partNo)
 *  AND — when `requiredNameLower` is provided — whose item name matches.
 *
 *  The name qualifier exists because designers routinely reuse ONE
 *  schematic-symbol part number (e.g. "RES2_0603") across many resistors of
 *  different values in the same BOM. Keying only on (brand, PN) collapses
 *  those rows into one item + one BOM line, silently losing the distinct
 *  values. Requiring a name match keeps each value its own item; two
 *  different items can share (brand, PN) — the per-item uniqueness index is
 *  on (item_id, brand_id), not on (brand_id, part_no) — so no conflict. */
async function findItemByBrandAndPartNo(
  tx: TxClient,
  ctx: TenantContext,
  brandId: string,
  partNo: string,
  requiredNameLower?: string,
): Promise<string | null> {
  if (requiredNameLower) {
    const hit = await tx.$queryRaw<{ item_id: string }[]>`
      SELECT v.item_id
        FROM item_variants v
        JOIN items i ON i.id = v.item_id AND i.deleted_at IS NULL
       WHERE v.company_id = ${ctx.companyId!}::uuid
         AND v.brand_id = ${brandId}::uuid
         AND v.source_kind = 'purchased'::item_variant_source
         AND v.deleted_at IS NULL
         AND LOWER(v.part_no) = LOWER(${partNo})
         AND LOWER(i.name) = ${requiredNameLower}
       LIMIT 1`;
    return hit[0]?.item_id ?? null;
  }
  const hit = await tx.$queryRaw<{ item_id: string }[]>`
    SELECT v.item_id
      FROM item_variants v
      JOIN items i ON i.id = v.item_id AND i.deleted_at IS NULL
     WHERE v.company_id = ${ctx.companyId!}::uuid
       AND v.brand_id = ${brandId}::uuid
       AND v.source_kind = 'purchased'::item_variant_source
       AND v.deleted_at IS NULL
       AND LOWER(v.part_no) = LOWER(${partNo})
     LIMIT 1`;
  return hit[0]?.item_id ?? null;
}

/** Ensure a purchased (item, brand) variant exists; return the variant id.
 *  Auto-flags is_default when the item has no default variant yet. */
async function ensurePurchasedVariant(
  tx: TxClient,
  ctx: TenantContext,
  itemId: string,
  brandId: string,
  partNo: string,
): Promise<{ variantId: string; created: boolean }> {
  const existing = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM item_variants
     WHERE company_id = ${ctx.companyId!}::uuid
       AND item_id = ${itemId}::uuid
       AND brand_id = ${brandId}::uuid
       AND source_kind = 'purchased'::item_variant_source
       AND deleted_at IS NULL
     LIMIT 1`;
  if (existing[0]) return { variantId: existing[0].id, created: false };

  const hasDefault = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM item_variants
     WHERE company_id = ${ctx.companyId!}::uuid
       AND item_id = ${itemId}::uuid
       AND is_default = true
       AND deleted_at IS NULL
     LIMIT 1`;
  const isDefault = hasDefault.length === 0;

  const inserted = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO item_variants (
      company_id, item_id, source_kind, brand_id, part_no, is_default,
      created_by, updated_by
    ) VALUES (
      ${ctx.companyId!}::uuid, ${itemId}::uuid,
      'purchased'::item_variant_source, ${brandId}::uuid,
      ${partNo}, ${isDefault},
      ${ctx.userId}::uuid, ${ctx.userId}::uuid
    )
    RETURNING id`;
  return { variantId: inserted[0].id, created: true };
}

/** Insert a fresh raw-type child item. Uses the same defaults the inline
 *  "new BOM child" flow used to (min_stock 10, base UOM PCS). `importSource`
 *  is the caller's `sourceLabel` — stamped on the row so the items list can
 *  show operators where the item first came in from. */
async function insertChildItem(
  tx: TxClient,
  ctx: TenantContext,
  args: {
    code: string;
    name: string;
    categoryId: string | null;
    solderType: "SMD" | "DIP" | null;
    footprint: string | null;
    defaultSupplierId: string | null;
    importSource: string | null;
  },
): Promise<string> {
  const inserted = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO items (
      company_id,
      code, name, category_id, item_type, base_uom,
      min_stock, reorder_qty, safety_stock,
      solder_type, footprint,
      default_supplier_id,
      import_source,
      status, created_by, updated_by
    ) VALUES (
      ${ctx.companyId!}::uuid,
      ${args.code}, ${args.name}, ${args.categoryId}::uuid, 'raw'::item_type, 'PCS',
      10, 0, 0,
      ${args.solderType}::solder_type_kind, ${args.footprint},
      ${args.defaultSupplierId}::uuid,
      ${args.importSource},
      'active'::item_status, ${ctx.userId}::uuid, ${ctx.userId}::uuid
    )
    RETURNING id`;
  return inserted[0].id;
}

/** Refuse the import when a Draft already exists on the parent. Callers must
 *  activate or delete it first — importing into a live Draft would silently
 *  mix hand-edits with new lines. */
async function assertNoDraft(tx: TxClient, parentItemId: string): Promise<void> {
  const draft = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM item_bom_versions
     WHERE parent_item_id = ${parentItemId}::uuid
       AND status = 'Draft'::bom_status
       AND deleted_at IS NULL
     LIMIT 1`;
  if (draft[0]) {
    throw Errors.conflict(
      "A Draft BOM version already exists on this item",
      { parentItemId, draftVersionId: draft[0].id },
      "Open the BOM editor and either Activate or delete the existing Draft, then retry the import.",
    );
  }
}

/** Confirm the parent exists, belongs to the tenant, and can hold a BOM
 *  (i.e. is not raw). Mirrors items.assertParentIsBomCapable but inlined so
 *  this file stays independently reviewable. */
async function assertParentImportable(tx: TxClient, parentItemId: string): Promise<void> {
  const row = await tx.$queryRaw<{ itemType: string }[]>`
    SELECT item_type::text AS "itemType"
      FROM items
     WHERE id = ${parentItemId}::uuid AND deleted_at IS NULL
     LIMIT 1`;
  if (!row[0]) throw Errors.notFound("Item");
  if (row[0].itemType === "raw") {
    throw Errors.badRequest(
      "Raw items don't carry a BOM — pick a semi-assembled or assembled parent",
      { itemType: row[0].itemType },
    );
  }
}

/** Concatenate refDes strings across merged rows, preserving order and
 *  dropping exact duplicates. "C1, C2" + "C2, C3" → "C1, C2, C3". */
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

// ── main entry ─────────────────────────────────────────────────────────────
export async function importBom(parentItemId: string, input: BomImportInput): Promise<BomImportResult> {
  return guarded("item.edit", async (tx, ctx) => {
    if (!isUuid(parentItemId)) throw Errors.notFound("Item");
    await assertParentImportable(tx, parentItemId);

    const mode = input.mode ?? "create";
    // In 'create' mode the parent must NOT already have a Draft — that state
    // is reserved for the user's own edits. In 'append' mode we REQUIRE an
    // existing Draft to fold into (the chunked-import path uses this after
    // its first batch has created one).
    let existingDraftId: string | null = null;
    if (mode === "append") {
      const draft = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM item_bom_versions
         WHERE parent_item_id = ${parentItemId}::uuid
           AND status = 'Draft'::bom_status
           AND deleted_at IS NULL
         LIMIT 1`;
      if (!draft[0]) {
        throw Errors.conflict(
          "No Draft BOM version to append to",
          { parentItemId },
          "Post the first batch with mode='create' before appending.",
        );
      }
      existingDraftId = draft[0].id;
    } else {
      await assertNoDraft(tx, parentItemId);
    }

    if (!Array.isArray(input.rows) || input.rows.length === 0) {
      throw Errors.badRequest("Import needs at least one row");
    }

    // Per-import caches. Keyed by lower-cased name / uppercased PN so lookups
    // stay consistent with the DB's case-insensitive matching.
    const brandCache = new Map<string, string>();     // lower(name) → brandId
    const supplierCache = new Map<string, string>();  // lower(name) → supplierId
    const itemByBrandPn = new Map<string, string>();  // `${brandId}|${upper(pn)}` → itemId
    const itemByNameFallback = new Map<string, string>(); // lower(name) → itemId (for rows with no PN)

    // Aggregation buffer for lines. Keyed by childItemId so two rows
    // targeting the same physical part merge into one line. In append mode
    // this is pre-seeded from the existing Draft's lines so cross-batch
    // dedup works the same way as within-batch dedup.
    interface LineBuf {
      childItemId: string;
      qty: number;
      refDes: string | null;
      /** Present when this line already exists in the Draft (append mode) —
       *  the write phase UPDATEs by id instead of INSERTing. */
      existingLineId?: string;
      /** DB row's sequence value, preserved on UPDATE so manual re-orders
       *  from prior batches survive the append. */
      existingSequence?: number | null;
    }
    const linesByChild = new Map<string, LineBuf>();
    let maxExistingSequence = 0;
    if (existingDraftId) {
      const existingLines = await tx.$queryRaw<{
        id: string; childItemId: string; qty: number; refDes: string | null; sequence: number | null
      }[]>`
        SELECT id, child_item_id AS "childItemId",
               qty::float8 AS qty, ref_des AS "refDes", sequence
          FROM item_bom_lines
         WHERE bom_version_id = ${existingDraftId}::uuid AND deleted_at IS NULL`;
      for (const l of existingLines) {
        linesByChild.set(l.childItemId, {
          childItemId: l.childItemId,
          qty: l.qty,
          refDes: l.refDes,
          existingLineId: l.id,
          existingSequence: l.sequence,
        });
        if (l.sequence != null && l.sequence > maxExistingSequence) maxExistingSequence = l.sequence;
      }
    }

    const skipped: { rowIndex: number; reason: string }[] = [];
    const warnings: string[] = [];
    let itemsCreated = 0;
    let itemsMatched = 0;
    let brandsCreated = 0;
    let suppliersCreated = 0;
    let variantsCreated = 0;

    const placeholderBrandId = await ensureNoManufacturerBrand(tx, ctx);
    // Placeholder is technically created only when a tenant is missing the
    // seed. We don't count that in brandsCreated — it's an infra brand, not a
    // user-authored one.

    for (let i = 0; i < input.rows.length; i++) {
      const row = input.rows[i];

      const name = (row.name ?? "").trim();
      if (!name) {
        skipped.push({ rowIndex: i, reason: "missing name" });
        continue;
      }
      if (!Number.isFinite(row.qty) || row.qty <= 0) {
        skipped.push({ rowIndex: i, reason: `invalid qty (${row.qty})` });
        continue;
      }
      if (row.categoryId != null && !isUuid(row.categoryId)) {
        skipped.push({ rowIndex: i, reason: `invalid categoryId ${row.categoryId}` });
        continue;
      }
      if (row.solderType != null && row.solderType !== "SMD" && row.solderType !== "DIP") {
        skipped.push({ rowIndex: i, reason: `solderType must be SMD or DIP, got ${row.solderType}` });
        continue;
      }

      // 1) Resolve brand — real manufacturer or placeholder.
      let brandId: string;
      const mfrName = (row.manufacturer ?? "").trim();
      if (mfrName) {
        const key = mfrName.toLowerCase();
        const cached = brandCache.get(key);
        if (cached) {
          brandId = cached;
        } else {
          // resolveOrCreateBrand's create path bumps the counter — detect by
          // pre-checking. Cheap and keeps the counters honest.
          const pre = await tx.brands.findFirst({
            where: { deleted_at: null, name: { equals: mfrName, mode: "insensitive" } },
            select: { id: true },
          });
          brandId = pre ? pre.id : await resolveOrCreateBrand(tx, ctx, mfrName);
          if (!pre) brandsCreated++;
          brandCache.set(key, brandId);
        }
      } else {
        brandId = placeholderBrandId;
      }

      // 2) Resolve supplier (optional). Only queried when a name is present.
      let supplierId: string | null = null;
      const supName = (row.supplier ?? "").trim();
      if (supName) {
        const key = supName.toLowerCase();
        const cached = supplierCache.get(key);
        if (cached) {
          supplierId = cached;
        } else {
          const pre = await tx.suppliers.findFirst({
            where: { deleted_at: null, name: { equals: supName, mode: "insensitive" } },
            select: { id: true },
          });
          supplierId = pre ? pre.id : await resolveOrCreateSupplier(tx, ctx, supName);
          if (!pre) suppliersCreated++;
          supplierCache.set(key, supplierId);
        }
      }

      // 3) Resolve or create child item. Dedup order:
      //    a) (brand, part_no) match on an existing variant → reuse item
      //    b) rows without a part number fall back to (lower(name) + footprint
      //       + solder) match inside this import batch — enough to treat two
      //       rows as the same physical part without collapsing distinct
      //       packages (e.g. "0.1uF" in C0603 vs DIP) into one line.
      let childItemId: string | null = null;
      const partNoRaw = (row.partNo ?? "").trim();
      const footprintRaw = (row.footprint ?? "").trim();
      // Fallback key: name + footprint + solder. Empty parts still key —
      // "same name, no footprint, no solder" rows correctly collapse.
      const nameFallbackKey = `${name.toLowerCase()}|${footprintRaw.toLowerCase()}|${row.solderType ?? ""}`;

      if (partNoRaw) {
        // Value-qualified key: designers reuse one PN (e.g. "RES2_0603")
        // across many resistor values in the same sheet. Only merge when
        // BOTH PN and name (value) match. Rows with only PN — no name to
        // qualify — still fall back to PN-only matching.
        const nameQual = name.toLowerCase();
        const key = `${brandId}|${partNoRaw.toUpperCase()}|${nameQual}`;
        const cached = itemByBrandPn.get(key);
        if (cached) {
          childItemId = cached;
          itemsMatched++;
        } else {
          const matched = await findItemByBrandAndPartNo(tx, ctx, brandId, partNoRaw, nameQual);
          if (matched) {
            childItemId = matched;
            itemByBrandPn.set(key, matched);
            itemsMatched++;
          }
        }
      } else {
        const cached = itemByNameFallback.get(nameFallbackKey);
        if (cached) {
          childItemId = cached;
          itemsMatched++;
        }
      }

      // 4) Create the child item when nothing matched.
      if (!childItemId) {
        const baseCode = suggestItemCode(name);
        if (!baseCode) {
          skipped.push({ rowIndex: i, reason: `couldn't derive a code from name "${name}"` });
          continue;
        }
        const code = await pickUniqueItemCode(tx, ctx, baseCode);
        try {
          childItemId = await insertChildItem(tx, ctx, {
            code,
            name,
            categoryId: row.categoryId ?? null,
            solderType: row.solderType ?? null,
            footprint: footprintRaw || null,
            defaultSupplierId: supplierId,
            importSource: input.sourceLabel?.trim() || null,
          });
          itemsCreated++;
          if (!partNoRaw) itemByNameFallback.set(nameFallbackKey, childItemId);
        } catch (err) {
          skipped.push({
            rowIndex: i,
            reason: `create item failed: ${err instanceof Error ? err.message : "unknown"}`,
          });
          continue;
        }
      }

      // 5) Ensure the (item, brand) variant exists. PN auto-generates when
      //    missing — this is where AUTO-{itemCode} lands. We need the code
      //    to build it, so query it now (variant creation only path).
      const itemCode = (await tx.$queryRaw<{ code: string }[]>`
        SELECT code FROM items WHERE id = ${childItemId}::uuid LIMIT 1`)[0]?.code ?? "UNKNOWN";
      const effectivePn = partNoRaw || `AUTO-${itemCode}`;
      const variantRes = await ensurePurchasedVariant(tx, ctx, childItemId, brandId, effectivePn);
      if (variantRes.created) variantsCreated++;
      // Cache the newly-known (brand, PN, name) → item mapping so later rows
      // dedup. Key shape mirrors the lookup above — name-qualified so a
      // shared PN across different values doesn't merge distinct items.
      itemByBrandPn.set(`${brandId}|${effectivePn.toUpperCase()}|${name.toLowerCase()}`, childItemId);

      // 6) Buffer the BOM line. Merge into any prior row for the same child.
      const refDes = (row.designator ?? "").trim() || null;
      const existing = linesByChild.get(childItemId);
      if (existing) {
        existing.qty += row.qty;
        existing.refDes = mergeRefDes(existing.refDes, refDes);
      } else {
        linesByChild.set(childItemId, { childItemId, qty: row.qty, refDes });
      }
    }

    const lines = Array.from(linesByChild.values());
    // In append mode `lines` includes pre-existing rows too; only new rows
    // matter for the "nothing survived" check.
    const newLineCount = lines.filter((l) => !l.existingLineId).length;
    if (newLineCount === 0 && mode === "create") {
      throw Errors.badRequest(
        "No importable rows survived validation",
        { skipped },
        "Every row was missing a name, had qty ≤ 0, or failed a lookup. Check the source and retry.",
      );
    }

    // 7) Resolve the BOM version. `create` mode auto-numbers a fresh Draft
    //    (mirrors createItemBomVersion so imported versions look native
    //    alongside hand-added ones); `append` reuses the Draft found above.
    let bomVersionId: string;
    if (existingDraftId) {
      bomVersionId = existingDraftId;
      // Bump the Draft's updated_at so listings reflect the append.
      await tx.$executeRaw`
        UPDATE item_bom_versions
           SET updated_by = ${ctx.userId}::uuid, updated_at = now()
         WHERE id = ${bomVersionId}::uuid`;
    } else {
      const nextRow = await tx.$queryRaw<{ n: number }[]>`
        SELECT COALESCE(count(*), 0)::int + 1 AS n
          FROM item_bom_versions
         WHERE parent_item_id = ${parentItemId}::uuid AND deleted_at IS NULL`;
      const version = `v${nextRow[0].n}`;
      const inserted = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO item_bom_versions (
          company_id, parent_item_id, version, status,
          created_by, updated_by
        ) VALUES (
          ${ctx.companyId!}::uuid, ${parentItemId}::uuid, ${version}, 'Draft'::bom_status,
          ${ctx.userId}::uuid, ${ctx.userId}::uuid
        ) RETURNING id`;
      bomVersionId = inserted[0].id;
    }

    // 8) Write lines. UPDATE any that were pre-loaded (append mode + existing
    //    child) so qty/refDes merges from earlier batches are persisted;
    //    INSERT anything new, continuing sequence beyond the max already
    //    used so manual re-orders from prior batches survive.
    let seq = Math.max(maxExistingSequence, 0) + 10;
    for (const l of lines) {
      if (l.existingLineId) {
        // Skip the UPDATE when this row was pre-loaded but no new merges
        // hit it — nothing changed and we don't need to churn updated_at.
        // Detection is best-effort (we don't track "was merged" separately);
        // still cheap enough to always UPDATE in practice.
        await tx.$executeRaw`
          UPDATE item_bom_lines
             SET qty = ${l.qty},
                 ref_des = ${l.refDes},
                 updated_by = ${ctx.userId}::uuid,
                 updated_at = now()
           WHERE id = ${l.existingLineId}::uuid`;
      } else {
        await tx.$executeRaw`
          INSERT INTO item_bom_lines (
            company_id, bom_version_id, child_item_id, qty, ref_des,
            sequence, created_by, updated_by
          ) VALUES (
            ${ctx.companyId!}::uuid, ${bomVersionId}::uuid, ${l.childItemId}::uuid,
            ${l.qty}, ${l.refDes},
            ${seq}, ${ctx.userId}::uuid, ${ctx.userId}::uuid
          )`;
        seq += 10;
      }
    }

    if (input.sourceLabel) {
      warnings.push(`Imported from ${input.sourceLabel}`);
    }
    if (skipped.length > 0) {
      warnings.push(`${skipped.length} row${skipped.length === 1 ? "" : "s"} skipped — see skipped[] for details.`);
    }

    return {
      parentItemId,
      bomVersionId,
      // Count only rows that landed as fresh INSERTs — pre-existing lines
      // pulled in from an append are already reflected in a prior batch.
      linesCreated: newLineCount,
      itemsCreated,
      itemsMatched,
      brandsCreated,
      suppliersCreated,
      variantsCreated,
      warnings,
      skipped,
    };
  });
}

