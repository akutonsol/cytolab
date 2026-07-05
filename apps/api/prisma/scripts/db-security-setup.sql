-- ============================================
-- Cytolab Database Security Setup
-- Run as PostgreSQL superuser/DBA
-- Run ONCE on each environment (dev, staging, prod)
-- ============================================

-- 1. Create restricted API user (replace passwords with strong values)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'cytolab_api') THEN
    CREATE USER cytolab_api WITH PASSWORD 'REPLACE_WITH_STRONG_PASSWORD';
  END IF;
END
$$;

-- 2. Create migration user (separate from API user)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'cytolab_migrate') THEN
    CREATE USER cytolab_migrate WITH PASSWORD 'REPLACE_WITH_STRONG_PASSWORD';
  END IF;
END
$$;

-- 3. Grant API user minimum required permissions
GRANT CONNECT ON DATABASE cytolab TO cytolab_api;
GRANT USAGE ON SCHEMA public TO cytolab_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cytolab_api;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cytolab_api;

-- 4. Ensure future tables are also covered
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cytolab_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO cytolab_api;

-- 5. Explicitly revoke dangerous operations from API user
REVOKE CREATE ON SCHEMA public FROM cytolab_api;

-- 6. Grant migration user full privileges (for prisma migrate deploy)
GRANT ALL PRIVILEGES ON DATABASE cytolab TO cytolab_migrate;
GRANT ALL PRIVILEGES ON SCHEMA public TO cytolab_migrate;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO cytolab_migrate;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO cytolab_migrate;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO cytolab_migrate;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON SEQUENCES TO cytolab_migrate;

-- ============================================
-- AUDIT LOG PROTECTION (Item 3)
-- Makes audit trail tamper-proof
-- ============================================

-- MaintenanceLog exists today — revoke mutation from the API user so a
-- compromised runtime cannot rewrite or erase maintenance history.
REVOKE UPDATE, DELETE ON "MaintenanceLog" FROM cytolab_api;

-- "AuditLog" is not yet a table in this schema (the current login/security audit
-- trail is "LoginAttempt"). Guard the revoke so this script never fails mid-run
-- on environments that lack the table; it auto-applies once AuditLog is added.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'AuditLog') THEN
    EXECUTE 'REVOKE UPDATE, DELETE ON "AuditLog" FROM cytolab_api';
  END IF;
  -- LoginAttempt is the present-day security audit trail; protect it too.
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'LoginAttempt') THEN
    EXECUTE 'REVOKE UPDATE, DELETE ON "LoginAttempt" FROM cytolab_api';
  END IF;
END
$$;

-- Verify (run after setup to confirm)
-- SELECT grantee, table_name, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_name IN ('AuditLog', 'MaintenanceLog', 'LoginAttempt')
-- ORDER BY table_name, grantee, privilege_type;
