import crypto from 'node:crypto';
import { env } from '@/server/env';
import { json } from '@/server/http/route';
import { purgeExpiredCredentials } from '@/server/auth/service';

/**
 * Host-agnostic scheduled entry point (decision D8). Vercel Cron calls it in the demo with
 * `Authorization: Bearer $CRON_SECRET`; in production any scheduler can call it the same way.
 * The secret is mandatory (env validation refuses to start without it).
 */
function authorized(req: Request): boolean {
  const expected = Buffer.from(`Bearer ${env().CRON_SECRET}`);
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}

export async function GET(req: Request) {
  if (!authorized(req)) return json({ error: { code: 'UNAUTHENTICATED', message: 'Unauthorized' } }, 401);
  const purged = await purgeExpiredCredentials();
  return json({ ok: true, purged });
}
