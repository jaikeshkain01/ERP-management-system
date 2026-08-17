-- ============================================================================
--  Nest "Magnetics" under "Electronic Components" (consistency)
-- ============================================================================
-- The regroup migration created Magnetics as a top-level root, while the other
-- electronic groups (Passive, Semiconductors, …) live under "Electronic
-- Components". Move Magnetics under it so the electronics branch is consistent,
-- then rebuild all materialised paths from the parent chain.
--
-- Per-company + guarded: only fires for companies that have both a root
-- 'magnetics' and a root 'electronic-components'.
--
-- Apply with:  npx prisma migrate deploy

UPDATE item_categories m
SET parent_id = ec.id, updated_at = now()
FROM item_categories ec
WHERE m.slug = 'magnetics' AND m.parent_id IS NULL AND m.deleted_at IS NULL
  AND ec.company_id = m.company_id AND ec.slug = 'electronic-components'
  AND ec.parent_id IS NULL AND ec.deleted_at IS NULL;

-- Rebuild paths (temp-unique pass avoids transient unique-index collisions).
UPDATE item_categories SET path = id::text WHERE deleted_at IS NULL;

WITH RECURSIVE tree AS (
  SELECT id, slug::text AS newpath
  FROM item_categories WHERE parent_id IS NULL AND deleted_at IS NULL
  UNION ALL
  SELECT ic.id, (t.newpath || '/' || ic.slug)
  FROM item_categories ic JOIN tree t ON ic.parent_id = t.id
  WHERE ic.deleted_at IS NULL
)
UPDATE item_categories ic
SET path = t.newpath, updated_at = now()
FROM tree t
WHERE t.id = ic.id;
