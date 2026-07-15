-- ============================================================================
--  StackIOT ERP — Step 4: grant runtime privileges to stack
--  Run as the OWNER superuser (`postgres`), connected to `stackiot_erp`, AFTER
--  `prisma migrate deploy` has created every table (step 3). RLS still applies
--  to stack on top of these grants — this only says "stack may run DML";
--  the tenant_isolation policies say "on which rows".
--
--  Usage:
--    psql -U postgres -h localhost -d stackiot_erp \
--         -f scripts/sql/02-grant-runtime-privileges.sql
--
--  Idempotent — safe to re-run (e.g. after a migration adds new tables).
-- ============================================================================

GRANT USAGE ON SCHEMA public TO stack;

-- DML on all current tables. No DDL, no ownership — stack cannot alter schema.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO stack;
GRANT USAGE, SELECT                 ON ALL SEQUENCES  IN SCHEMA public TO stack;
GRANT EXECUTE                       ON ALL FUNCTIONS  IN SCHEMA public TO stack;

-- Same grants automatically for objects a LATER migration creates (owned by
-- postgres). Without this you'd re-run the block above after every migration.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES    TO stack;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT                  ON SEQUENCES TO stack;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE                        ON FUNCTIONS TO stack;
