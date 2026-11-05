import 'server-only';
import crypto from 'node:crypto';

/**
 * Error monitoring (spec §11.6: Sentry). Dependency-free: when SENTRY_DSN is set, unexpected server errors are sent
 * to Sentry's envelope endpoint; otherwise they're only logged. Privacy (spec §9.7): only the error type, message,
 * stack and a few tags (route, request id) are sent — never request bodies, cookies, headers or user data — and
 * messages are scrubbed of anything that looks like an email, phone number or token.
 */

type Dsn = { endpoint: string; key: string };
let parsed: Dsn | null | undefined;

function dsn(): Dsn | null {
  if (parsed !== undefined) return parsed;
  const raw = process.env.SENTRY_DSN;
  try {
    if (!raw) throw new Error('no dsn');
    const u = new URL(raw);
    const project = u.pathname.replace(/^\/+/, '');
    parsed = { endpoint: `${u.protocol}//${u.host}/api/${project}/envelope/`, key: u.username };
  } catch {
    parsed = null;
  }
  return parsed;
}

export function scrubText(s: string) {
  return s
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\+?\d[\d\s-]{8,}\d/g, '[number]')
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, '[token]');
}

export async function reportError(err: unknown, tags: Record<string, string | undefined> = {}) {
  const d = dsn();
  if (!d) return;
  const e = err instanceof Error ? err : new Error(String(err));
  const event = {
    event_id: crypto.randomUUID().replace(/-/g, ''),
    timestamp: Date.now() / 1000,
    platform: 'node',
    level: 'error',
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    tags: Object.fromEntries(Object.entries(tags).filter(([, v]) => v)),
    exception: {
      values: [
        { type: e.name, value: scrubText(e.message), stacktrace: e.stack ? { frames: frames(e.stack) } : undefined },
      ],
    },
  };
  const body = `${JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString() })}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}`;
  try {
    await fetch(d.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${d.key}, sentry_client=edusaas/1.0`,
      },
      body,
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* monitoring must never break the request */
  }
}

function frames(stack: string) {
  return stack
    .split('\n')
    .slice(1, 30)
    .map((l) => /at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(l.trim()))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ function: m[1] ?? '?', filename: m[2], lineno: Number(m[3]), colno: Number(m[4]) }))
    .reverse();
}

/** For tests. */
export function resetMonitoringForTests() {
  parsed = undefined;
}
