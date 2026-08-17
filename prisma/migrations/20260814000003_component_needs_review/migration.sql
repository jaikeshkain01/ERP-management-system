-- ============================================================================
--  components.needs_review — review flag for auto-created / incomplete parts
-- ============================================================================
-- BOM import auto-creates components. Most resolve cleanly (category from the
-- BOM `Type`, specs from the row), but some can't (unknown Type, no part number,
-- ambiguous). Those are flagged needs_review = true so they surface in a review
-- queue instead of silently polluting the catalog. Cleared once a human confirms
-- the category / assigns a generic part number.
--
-- Apply with:  npx prisma migrate deploy

ALTER TABLE components ADD COLUMN needs_review boolean NOT NULL DEFAULT false;
CREATE INDEX ix_components_needs_review ON components (company_id) WHERE needs_review AND deleted_at IS NULL;
