-- ════════════════════════════════════════════════════════════════════════════
-- Security foundation: runtime roles, Row-Level Security, insert-only audit log.
-- Spec §8, §9.2, §9.7.
--
-- Roles (NOLOGIN groups; login roles are created per-environment by scripts/db-setup-roles.ts):
--   edusaas_app     RLS enforced. Used for every tenant-scoped request (withTenant()).
--   edusaas_system  Login role gets BYPASSRLS. Used only by auth, platform console, audit writer and jobs.
-- Neither role owns any table, so neither can ALTER/DISABLE RLS. Migrations run as the owner.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edusaas_app') THEN
    CREATE ROLE edusaas_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edusaas_system') THEN
    CREATE ROLE edusaas_system NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO edusaas_app, edusaas_system;

-- Default DML on current and future tables; sensitive tables are narrowed below.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO edusaas_app, edusaas_system;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO edusaas_app, edusaas_system;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO edusaas_app, edusaas_system;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO edusaas_app, edusaas_system;

-- Prisma's bookkeeping table is not for runtime roles.
REVOKE ALL ON TABLE "_prisma_migrations" FROM edusaas_app, edusaas_system;

-- ── Helper: current tenant from the transaction-local setting. Unset/empty → NULL → matches nothing (fail closed).
CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;

-- ── tenants: app role may only read its own tenant row.
REVOKE INSERT, UPDATE, DELETE ON TABLE tenants FROM edusaas_app;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenants FOR SELECT TO edusaas_app USING (id = app_current_tenant());

-- ── Standard tenant-scoped tables.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenant_settings', 'tenant_role_permissions', 'users'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I TO edusaas_app USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant())',
      t);
  END LOOP;
END $$;
REVOKE INSERT, DELETE ON TABLE tenant_settings FROM edusaas_app;

-- ── Credentials: never reachable from the app role (RLS on, no policy = deny; grants revoked too).
REVOKE ALL ON TABLE sessions, password_reset_tokens FROM edusaas_app;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens FORCE ROW LEVEL SECURITY;

-- ── Audit log: insert-only for BOTH runtime roles (spec §9.7). Archival deletes go through a
--    SECURITY DEFINER function added in Phase 5.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_logs FROM edusaas_app, edusaas_system;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON audit_logs FOR SELECT TO edusaas_app USING (tenant_id = app_current_tenant());
CREATE POLICY tenant_insert ON audit_logs FOR INSERT TO edusaas_app WITH CHECK (tenant_id = app_current_tenant());

-- ── Integrity rules the ORM can't express.
ALTER TABLE tenants ADD CONSTRAINT tenants_prefix_format CHECK (prefix ~ '^[a-z0-9]{2,10}$');
ALTER TABLE users ADD CONSTRAINT users_tenant_matches_role CHECK (
  (role IN ('PLATFORM_OWNER', 'PLATFORM_ADMIN') AND tenant_id IS NULL)
  OR (role NOT IN ('PLATFORM_OWNER', 'PLATFORM_ADMIN') AND tenant_id IS NOT NULL)
);
ALTER TABLE users ADD CONSTRAINT users_has_login_identifier CHECK (username_normalized IS NOT NULL OR email IS NOT NULL);
ALTER TABLE users ADD CONSTRAINT users_email_lowercase CHECK (email IS NULL OR email = lower(email));
ALTER TABLE tenant_settings ADD CONSTRAINT tenant_settings_threshold CHECK (at_risk_threshold BETWEEN 0 AND 100);
-- Spec §2.1: one School Admin account per school.
CREATE UNIQUE INDEX users_one_school_admin_per_tenant ON users (tenant_id)
  WHERE role = 'SCHOOL_ADMIN' AND deleted_at IS NULL;
