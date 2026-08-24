-- ============================================================================
--  ADD-FORM P6 — items packaging metadata
-- ============================================================================
-- Physical dimensions + weights + material + reusable flag. These live only
-- on `items` — the legacy `components` table has no packaging columns, so
-- there is no backfill or dual-write path.
--
-- All columns are nullable. Non-packaging items (an IT asset, a resistor)
-- typically leave them NULL; a packaging or finished-good item can fill them
-- in. The check constraints only reject non-positive values — a nil weight or
-- dimension is still legal.
--
-- Apply with:  npx prisma migrate deploy

ALTER TABLE items
  ADD COLUMN package_length_mm numeric(10,2) CHECK (package_length_mm IS NULL OR package_length_mm > 0),
  ADD COLUMN package_width_mm  numeric(10,2) CHECK (package_width_mm  IS NULL OR package_width_mm  > 0),
  ADD COLUMN package_height_mm numeric(10,2) CHECK (package_height_mm IS NULL OR package_height_mm > 0),
  ADD COLUMN package_weight_g  numeric(12,3) CHECK (package_weight_g  IS NULL OR package_weight_g  > 0),
  ADD COLUMN tare_weight_g     numeric(12,3) CHECK (tare_weight_g     IS NULL OR tare_weight_g     > 0),
  ADD COLUMN package_material  text,
  ADD COLUMN package_reusable  boolean;
