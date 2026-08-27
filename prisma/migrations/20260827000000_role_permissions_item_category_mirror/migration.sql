-- ============================================================================
--  Mirror `component.*` grants as `item_category.*` grants
-- ============================================================================
-- Introduces a dedicated `item_category` resource in `role_permissions`.
-- Historically `src/lib/server/data/item-categories.ts` guarded on
-- `component.*` because categories were part of the component master. Now
-- that `item_categories` is a first-class table with its own data layer
-- (post-Slice 1 Stage requirement, category cascade UI, inline-create) it
-- gets its own perm resource so an org can grant category management
-- separately from item CRUD.
--
-- Same pattern as F5.2 (`20260821000005_role_permissions_item_mirror`):
--   • Additive only. Existing `component.*` grants stay in place.
--   • For every existing (role_id, resource='component', action) row this
--     migration inserts an equivalent (role_id, resource='item_category',
--     action) grant.
--   • Idempotent via `ON CONFLICT DO NOTHING` on the composite PK, so a
--     re-run after a partial apply is safe.
--
-- Post-migration:
--   • `src/lib/permissions.ts` gains `item_category: CRUD` so the API
--     validates `item_category.<action>` strings.
--   • `src/lib/server/data/item-categories.ts` flips its four guards from
--     `component.view` / `component.edit` to `item_category.view` /
--     `item_category.edit` (same coarse mapping — create/update/delete
--     stay collapsed under `.edit` so no role loses category access at
--     cutover time).
--
-- Apply with:  npx prisma migrate deploy

INSERT INTO role_permissions (company_id, role_id, resource, action, created_by)
SELECT company_id, role_id, 'item_category', action, created_by
FROM role_permissions
WHERE resource = 'component'
ON CONFLICT DO NOTHING;
