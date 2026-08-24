-- ============================================================================
--  F5.2 — Mirror `component.*` grants as `item.*` grants
-- ============================================================================
-- Introduces the `item` resource in `role_permissions` without breaking any
-- legacy `component.*` guards. For every existing row where
-- (role_id, resource='component', action) exists, this migration inserts an
-- equivalent (role_id, resource='item', action) grant. Idempotent via
-- ON CONFLICT DO NOTHING on the composite PK.
--
-- SCOPE:
--   • Additive only. `component.*` grants stay in place — the legacy
--     /components/* code paths (bootstrap, dashboard, item_categories, the
--     redirect-wrapping shells) still check `component.*`.
--   • This mirror covers every role that had ANY component perm: new item.*
--     grants match the same actions the role already had.
--   • Post-migration, `src/lib/permissions.ts` gains `item: CRUD` so the API
--     validates `item.<action>` strings, and `src/lib/server/data/items.ts`
--     switches its guards from `component.*` to `item.*`.
--
-- Apply with:  npx prisma migrate deploy

INSERT INTO role_permissions (company_id, role_id, resource, action, created_by)
SELECT company_id, role_id, 'item', action, created_by
FROM role_permissions
WHERE resource = 'component'
ON CONFLICT DO NOTHING;
