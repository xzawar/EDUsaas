import 'server-only';
import crypto from 'node:crypto';

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '';
}

/** IPs are personal data: store a salted hash, never the raw address. */
export function ipHash(req: Request): string | null {
  const ip = clientIp(req);
  if (!ip) return null;
  return crypto.createHash('sha256').update(`edusaas-ip:${ip}`).digest('hex').slice(0, 32);
}

export function userAgent(req: Request): string | null {
  return req.headers.get('user-agent')?.slice(0, 300) ?? null;
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}

/**
 * CSRF defence in depth (cookies are SameSite=Lax): mutating requests must come from our own origin.
 * Requests without an Origin header (server-to-server, tests) are allowed; browsers always send it on POST.
 */
export function isSameOrigin(req: Request, appUrl: string): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    const o = new URL(origin);
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
    return o.host === new URL(appUrl).host || (host !== null && o.host === host);
  } catch {
    return false;
  }
}

/**
 * The session token: the httpOnly cookie for browsers, or `Authorization: Bearer <token>` for the mobile app, which
 * keeps the token in the device keystore instead of a cookie jar.
 */
export function sessionToken(req: Request, cookieName: string): string | undefined {
  const auth = req.headers.get('authorization');
  if (auth && /^Bearer\s+\S+$/i.test(auth)) return auth.split(/\s+/)[1];
  return readCookie(req, cookieName);
}

/** True for requests from the native app (it identifies itself; nothing security-relevant hangs on this). */
export function isMobileClient(req: Request): boolean {
  return /^android\//i.test(req.headers.get('x-edusaas-client') ?? '');
}
