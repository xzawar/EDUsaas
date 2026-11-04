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

async function main() {
  const client = new Client({ connectionString: required('DIRECT_URL') });
  await client.connect();
  const roles = [
    { login: 'edusaas_app_login', group: 'edusaas_app', password: required('DB_APP_PASSWORD'), attrs: 'NOBYPASSRLS' },
    {
      login: 'edusaas_system_login',
      group: 'edusaas_system',
      password: required('DB_SYSTEM_PASSWORD'),
      attrs: 'BYPASSRLS',
    },
  ];
  for (const r of roles) {
    const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [r.login]);
    const pw = client.escapeLiteral(r.password);
    if (exists.rowCount) {
      await client.query(`ALTER ROLE ${r.login} WITH LOGIN ${r.attrs} PASSWORD ${pw}`);
    } else {
      await client.query(`CREATE ROLE ${r.login} WITH LOGIN ${r.attrs} PASSWORD ${pw}`);
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
