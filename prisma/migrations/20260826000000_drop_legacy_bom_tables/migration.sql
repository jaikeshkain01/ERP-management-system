-- ============================================================================
--  D4 — drop the legacy PCB / product BOM tables
-- ============================================================================
-- End of the F6.4 arc:
--   • B1 (91a8d32) — universal BOM editor.
--   • B2 (ea97987) — bidirectional dual-write.
--   • B3 (f0a1075) — production explodes universal item_bom_lines.
--   • B4 (5ae7da9) — legacy structure pages retired.
--   • D1 (56efc43) — dashboard / bootstrap / brands guard readers ported.
--   • D3            — /api/pcbs, /api/products, all PCB modals, and the
--                     /pcb-management/import bulk flow deleted; data layers
--                     `pcbs.ts` and `products.ts` gone; mirror plumbing
--                     retired in items.ts.
-- This migration drops the three legacy BOM tables:
--   • pcb_lines       — PCB revision BOM lines
--   • product_pcbs    — product → PCB revision links
--   • bom_versions    — product-side BOM headers
--
-- KEPT (not dropped):
--   • pcbs, pcb_revisions — still carry the "PCB parent + revision label"
--     identity that /items/[id]/bom joins to for slug/rev display.
--   • products — still carries product metadata (name, code, version,
--     estimated_cost) that bootstrap.ts reads.
--
-- CASCADE drops the FK constraint that was on
-- `production_orders.bom_version_id → bom_versions`. The column itself
-- stays as a nullable uuid — historical rows keep whatever snapshot uuid
-- they had (legacy bom_versions.id OR item_bom_versions.id, depending on
-- when the order was created). New orders record item_bom_versions.id
-- (see production.ts). Dashboard / KPI paths don't join that column.
--
-- No data migration is needed here: F6.2 (item_boms_backfill) already
-- mirrored every legacy BOM row into item_bom_versions/item_bom_lines,
-- and B2 kept the two sides in sync afterward.
--
-- Apply with:  npx prisma migrate deploy

DROP TABLE IF EXISTS product_pcbs CASCADE;
DROP TABLE IF EXISTS pcb_lines    CASCADE;
DROP TABLE IF EXISTS bom_versions CASCADE;

-- item_bom_versions still carries legacy_pcb_revision_id and
-- legacy_bom_version_id columns (populated by F6.2 for backfilled rows,
-- and by B2 for lazy-shadows). They stay for historical audit but no
-- longer FK anywhere; keeping them as untyped uuids is fine.
