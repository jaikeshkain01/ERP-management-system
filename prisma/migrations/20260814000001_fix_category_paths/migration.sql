-- ============================================================================
--  FIX item_categories.path — rebuild the materialised path from the parent chain
-- ============================================================================
-- The previous regroup migration set some children's `path` using the parent's
-- SLUG instead of the parent's full PATH, so nodes below a nested parent got a
-- truncated path (e.g. 'passive/capacitor' instead of
-- 'electronic-components/passive/capacitor'). The parent_id relationships are
-- correct — only the denormalised `path` cache is wrong.
--
-- This rebuilds every node's path from its parent_id chain (the source of truth).
-- Step 1 parks all paths at a guaranteed-unique temp value so the second pass
-- can't transiently violate the (company_id, path) unique index.
--
-- Apply with:  npx prisma migrate deploy

-- 1) Temporary unique paths (avoid transient unique-index collisions).
UPDATE item_categories SET path = id::text WHERE deleted_at IS NULL;

-- 2) Rebuild correct paths top-down from the roots.
WITH RECURSIVE tree AS (
  SELECT id, slug::text AS newpath
  FROM item_categories
  WHERE parent_id IS NULL AND deleted_at IS NULL
  UNION ALL
  SELECT ic.id, (t.newpath || '/' || ic.slug)
  FROM item_categories ic
  JOIN tree t ON ic.parent_id = t.id
  WHERE ic.deleted_at IS NULL
)
UPDATE item_categories ic
SET path = t.newpath, updated_at = now()
FROM tree t
WHERE t.id = ic.id;
