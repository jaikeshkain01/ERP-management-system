-- ============================================================================
--  F1 verification — run AFTER the migration to prove the exit criteria.
--   psql "$DATABASE_URL" -f prisma/migrations/20260819000000_items_universal_master/verify.sql
--
-- Every SELECT below should return exactly the value in its comment. Anything
-- else = migration didn't apply cleanly, investigate.
-- ============================================================================

-- 1. Tables exist and are empty. -----------------------------------------------
SELECT count(*) AS items_row_count          FROM items;         -- expected: 0
SELECT count(*) AS item_variants_row_count  FROM item_variants; -- expected: 0

-- 2. Enums exist with the right labels. ----------------------------------------
SELECT unnest(enum_range(NULL::item_status))        AS item_status;         -- expected: active, inactive, discontinued
SELECT unnest(enum_range(NULL::item_variant_source)) AS item_variant_source; -- expected: purchased, manufactured

-- 3. RLS is enabled AND forced on both tables. --------------------------------
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname IN ('items','item_variants')
ORDER BY relname;
-- expected: both rows show relrowsecurity=t AND relforcerowsecurity=t

-- 4. tenant_isolation policy is attached to both tables. ----------------------
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('items','item_variants')
ORDER BY tablename;
-- expected: two rows, both policyname='tenant_isolation'

-- 5. Triggers are attached (updated_at + audit). ------------------------------
SELECT event_object_table AS tbl, trigger_name
FROM information_schema.triggers
WHERE event_object_table IN ('items','item_variants')
  AND trigger_name IN (
    'trg_items_updated','trg_items_audit',
    'trg_item_variants_updated','trg_item_variants_audit'
  )
ORDER BY tbl, trigger_name;
-- expected: 4 rows (2 per table)

-- 6. Composite-target unique key exists (needed for future FK repointing). ----
SELECT conname FROM pg_constraint
WHERE conrelid = 'items'::regclass AND contype = 'u'
ORDER BY conname;
-- expected: at least one row for (company_id, id)

-- 7. End-to-end insert (requires GUCs). ---------------------------------------
-- Point the session at a real company_id + user_id before running this block.
-- Replace the two literals below; the sanity insert exercises RLS, defaults,
-- and the audit trigger in one shot, then rolls back.
--
-- BEGIN;
--   SET LOCAL app.current_company_id = '<company-uuid>';
--   SET LOCAL app.current_user_id    = '<user-uuid>';
--   INSERT INTO items (company_id, code, name)
--     VALUES (current_setting('app.current_company_id')::uuid, 'F1-SANITY', 'F1 sanity item')
--     RETURNING id;
--   SELECT count(*) FROM audit_logs
--     WHERE entity = 'items' AND action = 'INSERT' AND changed_at > now() - interval '1 minute';
--   -- expected: 1
-- ROLLBACK;
