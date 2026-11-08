import 'server-only';
import { systemDb } from '@/server/db/system';
import { AppError } from '@/server/http/errors';

/**
 * Fixed-window counters kept in Postgres, so they hold across serverless instances (spec §9.4).
 *
 * Sign-in counts only FAILED attempts per network: a whole school often shares one public IP, so 40 students
 * signing in during a lab period must never be blocked, while someone spraying passwords across many accounts
 * (which produces failures) is. Per-account lockout still stops guessing one account's password.
 * Requests without an IP (local tools) are not limited.
 */

const BLOCKED = 'Too many failed sign-ins from this network. Please wait a few minutes and try again.';

/** Throws if `key` already reached `limit` within the current window. Doesn't count this request. */
export async function assertUnderLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  message = BLOCKED,
): Promise<void> {
  const rows = await systemDb().$queryRaw<{ count: number }[]>`
    SELECT count FROM rate_limits WHERE key = ${key} AND window_start >= now() - make_interval(secs => ${windowSeconds})`;
  if ((rows[0]?.count ?? 0) >= limit) throw new AppError('RATE_LIMITED', message);
}

/** Adds one to `key`'s counter (starting a new window when the old one has passed). Returns the new count. */
export async function recordHit(key: string, windowSeconds: number): Promise<number> {
  const rows = await systemDb().$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limits (key, window_start, count) VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) THEN now() ELSE rate_limits.window_start END
    RETURNING count`;
  return rows[0]?.count ?? 0;
}

/** Counts every request (password-reset emails), refusing once over the limit. */
export async function rateLimit(key: string, limit: number, windowSeconds: number, message?: string): Promise<void> {
  if ((await recordHit(key, windowSeconds)) > limit) {
    throw new AppError(
      'RATE_LIMITED',
      message ?? 'Too many requests from this network. Please wait a few minutes and try again.',
    );
  }
}

export const LIMITS = {
  /** Failed sign-ins per network. */
  loginFailures: { limit: 50, windowSeconds: 600 },
  passwordReset: { limit: 10, windowSeconds: 3600 },
} as const;

export async function purgeRateLimits() {
  return systemDb().$executeRaw`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`;
}
