import 'server-only';
import { systemDb } from '@/server/db/system';
import { AppError } from '@/server/http/errors';

/**
 * Fixed-window rate limit kept in Postgres, so it holds across serverless instances (spec §9.4). Complements
 * per-account lockout: lockout stops guessing one password, this stops spraying many accounts from one network.
 * The key is built from a hashed IP; requests without an IP (local tools) are not limited.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const rows = await systemDb().$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limits (key, window_start, count) VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) THEN now() ELSE rate_limits.window_start END
    RETURNING count`;
  if ((rows[0]?.count ?? 0) > limit) {
    throw new AppError('RATE_LIMITED', 'Too many attempts from this network. Please wait a few minutes and try again.');
  }
}

export const LIMITS = {
  login: { limit: 30, windowSeconds: 600 },
  passwordReset: { limit: 10, windowSeconds: 3600 },
} as const;

export async function purgeRateLimits() {
  const r = await systemDb().$executeRaw`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`;
  return r;
}
