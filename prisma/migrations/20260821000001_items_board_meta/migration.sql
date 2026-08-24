-- ============================================================================
--  ADD-FORM P5 — items.solder_type / footprint / spq
-- ============================================================================
-- Board-level metadata for items that live on a PCB (raw electronics + PCB
-- sub-assemblies). These columns already exist on `components`; we mirror them
-- onto `items` so the universal-item add form can carry the same fields
-- without going through the legacy tables.
--
-- All three are nullable — non-board item types (assets, packaging,
-- consumables) leave them NULL and the UI hides the section for them.
--
-- BACKFILL:
--   Component-backed items copy `components.solder_type / footprint / spq`
--   directly. Product- and PCB-revision-backed items leave them NULL — those
--   aggregates are not themselves surface-mounted or through-hole.
--
-- Apply with:  npx prisma migrate deploy

-- 1) Enum (kept small; SMD / DIP covers today's flow).
CREATE TYPE solder_type_kind AS ENUM ('SMD', 'DIP');

-- 2) Columns
ALTER TABLE items
  ADD COLUMN solder_type solder_type_kind,
  ADD COLUMN footprint   text,
  ADD COLUMN spq         integer CHECK (spq IS NULL OR spq > 0);

-- 3) Backfill from components. `components.solder_type` is `text NULL`; we
-- coerce the two known values via CASE. Anything else (unlikely, since the app
-- validates SMD/DIP) drops to NULL rather than breaking the migration.
UPDATE items i
   SET solder_type = CASE
         WHEN c.solder_type = 'SMD' THEN 'SMD'::solder_type_kind
         WHEN c.solder_type = 'DIP' THEN 'DIP'::solder_type_kind
         ELSE NULL
       END,
       footprint   = c.footprint,
       spq         = c.spq
  FROM components c
 WHERE c.id = i.id;

-- 4) Lookup index — filtering by footprint is a common list-view pattern.
CREATE INDEX ix_items_footprint ON items (company_id, footprint) WHERE deleted_at IS NULL AND footprint IS NOT NULL;
