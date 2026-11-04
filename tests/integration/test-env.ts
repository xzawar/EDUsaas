import 'dotenv/config';

/** Integration tests run against `<db>_test`, never the dev database. */
function toTestDb(url: string | undefined, name: string): string {
  if (!url) throw new Error(`${name} must be set (see .env.example)`);
  const u = new URL(url);
  const db = u.pathname.replace(/^\//, '');
  if (!db.endsWith('_test')) u.pathname = `/${db}_test`;
  return u.toString();
}

export function testEnv() {
  return {
    DATABASE_URL: toTestDb(process.env.DATABASE_URL, 'DATABASE_URL'),
    SYSTEM_DATABASE_URL: toTestDb(process.env.SYSTEM_DATABASE_URL, 'SYSTEM_DATABASE_URL'),
    DIRECT_URL: toTestDb(process.env.DIRECT_URL, 'DIRECT_URL'),
    APP_URL: 'http://localhost:3000',
    CRON_SECRET: 'integration-test-cron-secret-000000000000',
    SESSION_TTL_DAYS: '60',
  };
}
