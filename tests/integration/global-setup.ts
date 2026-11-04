import { execSync } from 'node:child_process';
import { Client } from 'pg';
import { testEnv } from './test-env';

/** Creates the test database if needed, applies all migrations and grants the runtime login roles. */
export default async function globalSetup() {
  const env = testEnv();
  const target = new URL(env.DIRECT_URL);
  const dbName = target.pathname.slice(1);
  const admin = new URL(env.DIRECT_URL);
  admin.pathname = '/postgres';
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (!exists.rowCount) await client.query(`CREATE DATABASE ${client.escapeIdentifier(dbName)}`);
  await client.end();

  const childEnv = { ...process.env, ...env };
  execSync('npx prisma migrate deploy', { env: childEnv, stdio: 'pipe' });
  execSync('npx tsx scripts/db-setup-roles.ts', { env: childEnv, stdio: 'pipe' });
}
