-- ============================================================================
--  SUPERADMIN  (cross-tenant platform administration)
-- ============================================================================
-- A superadmin is a GLOBAL platform administrator who manages users, companies,
-- roles/permissions and module licensing ACROSS every tenant. This is additive
-- to the per-company RBAC: a flag on the global users table, an is_superadmin()
-- helper, and PERMISSIVE RLS policies that OR-in full access on the handful of
-- governance tables the superadmin console touches. The existing
-- tenant_isolation / member-visibility policies are left untouched — permissive
-- policies combine with OR, so ordinary tenant scoping is unchanged for everyone
-- who is not a superadmin. Idempotent: safe to re-run.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_superadmin boolean NOT NULL DEFAULT false;

-- True when the current_user_id() GUC identifies an active superadmin. STABLE and
-- reads the GLOBAL (RLS-free) users table, so it is safe to call inside a policy.
CREATE OR REPLACE FUNCTION is_superadmin() RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT coalesce(
      (SELECT u.is_superadmin FROM users u
        WHERE u.id = current_user_id() AND u.deleted_at IS NULL),
      false)
$$;

-- Full cross-tenant access for superadmins on the governance tables. Each is a
-- PERMISSIVE policy, OR'd with the tenant_isolation / member-visibility policy
-- already present on the table.
DROP POLICY IF EXISTS superadmin_all ON companies;
CREATE POLICY superadmin_all ON companies           USING (is_superadmin()) WITH CHECK (is_superadmin());
DROP POLICY IF EXISTS superadmin_all ON company_memberships;
CREATE POLICY superadmin_all ON company_memberships USING (is_superadmin()) WITH CHECK (is_superadmin());
DROP POLICY IF EXISTS superadmin_all ON roles;
CREATE POLICY superadmin_all ON roles               USING (is_superadmin()) WITH CHECK (is_superadmin());
DROP POLICY IF EXISTS superadmin_all ON role_permissions;
CREATE POLICY superadmin_all ON role_permissions    USING (is_superadmin()) WITH CHECK (is_superadmin());
DROP POLICY IF EXISTS superadmin_all ON company_modules;
CREATE POLICY superadmin_all ON company_modules     USING (is_superadmin()) WITH CHECK (is_superadmin());

-- Promote the seeded administrator to superadmin so the console is reachable
-- (dev-login signs in as the first active user = this administrator).
UPDATE users SET is_superadmin = true WHERE lower(email) = 'admin@stackiot.local';
