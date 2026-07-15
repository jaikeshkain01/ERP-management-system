-- ============================================================================
--  StackIOT ERP — Step 1: database + runtime role
--  Run as a Postgres SUPERUSER (the `postgres` role), connected to the default
--  `postgres` database. This creates the tenant DB and the least-privileged
--  runtime role. It does NOT create tables — Prisma migrations do that (step 3).
--
--  Usage (the password is passed in, never hard-coded here):
--    psql -U postgres -h localhost -d postgres \
--         -v stack_password="'CHANGE_ME_strong_password'" \
--         -f scripts/sql/01-create-db-and-role.sql
--
--  Note the doubled quoting on -v: the value must arrive as a quoted SQL literal.
--  Idempotent — safe to re-run (re-running just resets the stack password).
-- ============================================================================

-- Runtime role: LOGIN, but explicitly NOT a superuser and NOT bypassing RLS, so
-- Row-Level Security actually confines the app to the active tenant. See
-- docs/schema.sql (§RLS) and src/lib/prisma.ts (withTenant).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stack') THEN
    CREATE ROLE stack LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

ALTER ROLE stack WITH PASSWORD :'stack_password';

-- The database, owned by postgres (the owner/CLI role that runs migrations and
-- owns every table). CREATE DATABASE can't run inside a DO block/transaction, so
-- we conditionally emit it with \gexec.
SELECT 'CREATE DATABASE stackiot_erp OWNER postgres'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'stackiot_erp')\gexec

GRANT CONNECT ON DATABASE stackiot_erp TO stack;
