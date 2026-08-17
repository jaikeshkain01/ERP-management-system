-- ============================================================================
--  components.generic_pn — make optional (blank when not available)
-- ============================================================================
-- A component may now be identified by its manufacturer PN only, so the internal
-- generic PN can be absent. The client id space falls back to the row uuid when
-- generic_pn is null (see bootstrap). The partial-unique index already tolerates
-- multiple NULLs (NULLs are distinct), so nothing else changes.
--
-- Apply with:  npx prisma migrate deploy

ALTER TABLE components ALTER COLUMN generic_pn DROP NOT NULL;
