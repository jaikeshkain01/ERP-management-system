-- ============================================================================
--  Seed a per-tenant "No Manufacturer" placeholder brand (Slice A of the
--  BOM importer)
-- ============================================================================
-- The importer sinks every unbranded row into a single, consistent per-tenant
-- brand rather than leaving variants brand-less or creating throwaway brands
-- named after the source file. That keeps "show me every part still missing
-- an MPN" a one-filter question ("brand = no-manufacturer") instead of a
-- fuzzy search.
--
-- Rules the importer relies on:
--   • Exactly one placeholder brand per tenant, addressable by slug
--     'no-manufacturer'.
--   • Never soft-deleted (deleted_at IS NULL).
--   • Status defaults to 'Approved' (per brands table default) — it needs to
--     show up in every "pick a brand" list without extra filtering.
--   • The user may rename its display name; the slug is the stable handle.
--
-- Idempotent: ON CONFLICT DO NOTHING against the existing partial unique
-- index uq_brands_slug (company_id, slug) WHERE deleted_at IS NULL. Safe to
-- re-run on a live DB; existing placeholder rows are left as-is.
--
-- Apply with:  npx prisma migrate deploy

INSERT INTO brands (company_id, slug, name, description, status)
SELECT co.id,
       'no-manufacturer',
       'No Manufacturer',
       'Placeholder brand for imported parts with no manufacturer specified. '
       || 'Filter by this brand to find items still missing an MPN.',
       'Approved'::brand_status
FROM companies co
ON CONFLICT DO NOTHING;
