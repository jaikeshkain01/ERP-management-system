-- ============================================================================
--  ADD-FORM P7 — items storage / MSL metadata
-- ============================================================================
-- Storage requirements: temperature and humidity operating ranges, IPC/JEDEC
-- moisture sensitivity level (J-STD-020), hazardous-material flag, and an
-- expiry-tracked flag that tells receiving whether a lot-level expiry is
-- required at goods-in.
--
-- Items-only; components has no storage columns. Numeric fields are nullable
-- and constrained to a sane physical range; ordering (min ≤ max) is enforced
-- only when both bounds are set — a single-sided limit ("keep below 40°C") is
-- still legal.
--
-- MSL is stored as text because J-STD-020 uses non-integer levels (2a, 5a, 6);
-- validated at the app layer to the allowed set.
--
-- Apply with:  npx prisma migrate deploy

ALTER TABLE items
  ADD COLUMN storage_temp_min_c        numeric(6,2)
    CHECK (storage_temp_min_c IS NULL OR (storage_temp_min_c >= -100 AND storage_temp_min_c <= 200)),
  ADD COLUMN storage_temp_max_c        numeric(6,2)
    CHECK (storage_temp_max_c IS NULL OR (storage_temp_max_c >= -100 AND storage_temp_max_c <= 200)),
  ADD COLUMN storage_humidity_min_pct  numeric(5,2)
    CHECK (storage_humidity_min_pct IS NULL OR (storage_humidity_min_pct >= 0 AND storage_humidity_min_pct <= 100)),
  ADD COLUMN storage_humidity_max_pct  numeric(5,2)
    CHECK (storage_humidity_max_pct IS NULL OR (storage_humidity_max_pct >= 0 AND storage_humidity_max_pct <= 100)),
  ADD COLUMN msl_level                 text
    CHECK (msl_level IS NULL OR msl_level IN ('1', '2', '2a', '3', '4', '5', '5a', '6')),
  ADD COLUMN hazardous                 boolean,
  ADD COLUMN expiry_tracked            boolean,

  -- Ordering guards: only bite when both bounds are set. A single-sided limit
  -- like "keep below 40°C" (max set, min null) stays legal.
  ADD CONSTRAINT items_storage_temp_range CHECK (
    storage_temp_min_c IS NULL
    OR storage_temp_max_c IS NULL
    OR storage_temp_min_c <= storage_temp_max_c
  ),
  ADD CONSTRAINT items_storage_humidity_range CHECK (
    storage_humidity_min_pct IS NULL
    OR storage_humidity_max_pct IS NULL
    OR storage_humidity_min_pct <= storage_humidity_max_pct
  );

-- Filters we expect the list view to use eventually.
CREATE INDEX ix_items_hazardous       ON items (company_id) WHERE hazardous      = true AND deleted_at IS NULL;
CREATE INDEX ix_items_expiry_tracked  ON items (company_id) WHERE expiry_tracked = true AND deleted_at IS NULL;
