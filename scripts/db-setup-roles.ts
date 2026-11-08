/**
 * Creates/updates the two runtime LOGIN roles for this environment.
 * Run after `prisma migrate deploy` with the owner connection (DIRECT_URL).
 *
 *   edusaas_app_login     → member of edusaas_app (RLS enforced)
 *   edusaas_system_login  → member of edusaas_system, BYPASSRLS (role attributes are not inherited, so set here)
 *
 * On Supabase, run with the `postgres` connection string as DIRECT_URL.
 */
import 'dotenv/config';
import { Client } from 'pg';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

/**
 * True if the app can already sign in with this role's connection string. Re-setting an unchanged password is
 * not a no-op: it creates a new SCRAM secret, and connection poolers (e.g. Supabase Supavisor) that cache the
 * old one then reject logins for a while. So we only (re)set passwords that don't already work.
 */
async function canConnect(url: string | undefined): Promise<boolean> {
  if (!url) return false;
  const c = new Client({ connectionString: url, connectionTimeoutMillis: 8000 });
  try {
    await c.connect();
    await c.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await c.end().catch(() => undefined);
  }
}

async function main() {
  const client = new Client({ connectionString: required('DIRECT_URL') });
  await client.connect();
  const roles = [
    {
      login: 'edusaas_app_login',
      group: 'edusaas_app',
      password: required('DB_APP_PASSWORD'),
      attrs: 'NOBYPASSRLS',
      url: process.env.DATABASE_URL,
    },
    {
      login: 'edusaas_system_login',
      group: 'edusaas_system',
      password: required('DB_SYSTEM_PASSWORD'),
      attrs: 'BYPASSRLS',
      url: process.env.SYSTEM_DATABASE_URL,
    },
  ];
  for (const r of roles) {
    const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [r.login]);
    const pw = client.escapeLiteral(r.password);
    try {
      if (exists.rowCount) {
        const works = await canConnect(r.url);
        await client.query(`ALTER ROLE ${r.login} WITH LOGIN ${r.attrs}${works ? '' : ` PASSWORD ${pw}`}`);
        if (!works) console.log(`  password (re)set for ${r.login}`);
      } else {
        await client.query(`CREATE ROLE ${r.login} WITH LOGIN ${r.attrs} PASSWORD ${pw}`);
      }
    } catch (e) {
      throw new Error(
        `Could not create/update ${r.login} (${r.attrs}): ${(e as Error).message}. ` +
          'DIRECT_URL must use a role allowed to create roles with BYPASSRLS (on Supabase: the "postgres" user).',
      );
    }
    await client.query(`GRANT ${r.group} TO ${r.login}`);
    const db = (await client.query('SELECT current_database() AS db')).rows[0].db as string;
    await client.query(`GRANT CONNECT ON DATABASE ${client.escapeIdentifier(db)} TO ${r.login}`);
    console.log(`✓ ${r.login} (${r.attrs}) in ${r.group}`);
  }
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
