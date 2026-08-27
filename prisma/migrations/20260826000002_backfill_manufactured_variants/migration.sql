-- ============================================================================
--  BACKFILL: attach a Made-in-house variant to every assembled /
--  semi_assembled item that is missing one.
-- ============================================================================
-- The universal-item form has never posted the manufactured variant for these
-- item types (comment in items.ts::createItem was explicit about it). Result:
-- items created via the new form ship with zero variants, which blocks Stock
-- In (the dialog needs a variant to write against) and blocks production
-- completion (completeProductionOrder selects the manufactured variant to
-- land finished units into and 409s when it's missing).
--
-- The DB has a partial unique index enforcing "at most one manufactured
-- variant per item", so this backfill guards against re-runs by only inserting
-- where no manufactured variant currently exists.
--
-- Default flag: only flip default=true when the item has NO existing default
-- (a purchased-variant default already claiming the slot wins, so dual-source
-- items keep the buyer's preferred brand as the shopping default).
--
-- Apply with:  npx prisma migrate deploy

INSERT INTO item_variants (
  company_id, item_id, source_kind, brand_id, part_no, is_default,
  created_by, updated_by
)
SELECT
  i.company_id,
  i.id,
  'manufactured'::item_variant_source,
  NULL,
  NULL,
  NOT EXISTS (
    SELECT 1 FROM item_variants v
    WHERE v.item_id = i.id
      AND v.is_default = true
      AND v.deleted_at IS NULL
  ),
  i.created_by,
  i.created_by
FROM items i
WHERE i.deleted_at IS NULL
  AND i.item_type IN ('semi_assembled'::item_type, 'assembled'::item_type)
  AND NOT EXISTS (
    SELECT 1 FROM item_variants v
    WHERE v.item_id = i.id
      AND v.source_kind = 'manufactured'::item_variant_source
      AND v.deleted_at IS NULL
  );
