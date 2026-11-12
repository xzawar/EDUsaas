/**
 * CI guard (plan §13): fails if any table that the app role can touch has RLS disabled or not forced,
 * or if a table with a tenant_id column has no policy for the app role.
 * Tables intentionally without policies (deny-all for the app role) must have no app-role grants.
 */
import 'dotenv/config';
import { Client } from 'pg';

// System-role-only tables: the tenant app role has no grants at all (auth secrets, rate limits, platform billing,
// platform admin grants, audit archive index).
const DENY_ALL_TABLES = new Set([
  'sessions',
  'password_reset_tokens',
  'rate_limits',
  'plans',
  'subscriptions',
  'platform_permission_grants',
  'audit_archives',
  'push_tokens',
]);

async function main() {
  const client = new Client({ connectionString: process.env.DIRECT_URL });
  await client.connect();
  const { rows } = await client.query<{
    table: string;
    rls: boolean;
    forced: boolean;
    has_tenant: boolean;
    app_policies: number;
    app_grants: number;
  }>(`
    SELECT c.relname AS table,
           c.relrowsecurity AS rls,
           c.relforcerowsecurity AS forced,
           EXISTS (SELECT 1 FROM information_schema.columns col
                   WHERE col.table_schema = 'public' AND col.table_name = c.relname AND col.column_name IN ('tenant_id')) AS has_tenant,
           (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname
              AND 'edusaas_app' = ANY (p.roles))::int AS app_policies,
           (SELECT count(*) FROM information_schema.role_table_grants g
              WHERE g.table_schema = 'public' AND g.table_name = c.relname AND g.grantee = 'edusaas_app')::int AS app_grants
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'
    ORDER BY 1`);

  const problems: string[] = [];
  for (const r of rows) {
    if (!r.rls) problems.push(`${r.table}: RLS not enabled`);
    if (!r.forced) problems.push(`${r.table}: RLS not forced`);
    if (DENY_ALL_TABLES.has(r.table)) {
      if (r.app_grants > 0) problems.push(`${r.table}: deny-all table must have no edusaas_app grants`);
      continue;
    }
    if (r.app_grants > 0 && r.app_policies === 0) problems.push(`${r.table}: app role has grants but no policy`);
    if (r.has_tenant && r.app_policies === 0) problems.push(`${r.table}: has tenant_id but no edusaas_app policy`);
  }
  await client.end();
  if (problems.length) {
    console.error('RLS check failed:\n  ' + problems.join('\n  '));
    process.exit(1);
  }
  console.log(`✓ RLS check passed for ${rows.length} tables`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
