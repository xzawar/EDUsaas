import { z } from 'zod';
import { defineRoute } from '@/server/http/route';
import { AppError } from '@/server/http/errors';
import { login } from '@/server/auth/service';
import { LIMITS, assertUnderLimit, recordHit } from '@/server/auth/ratelimit';
import { PORTAL_SLUGS, type PortalSlug } from '@/server/auth/portals';
import { sessionCookie } from '@/server/auth/session';
import { isMobileClient } from '@/server/http/request';

const schema = z.object({
  identifier: z.string().trim().min(1, 'Enter your username or email').max(200),
  password: z.string().min(1, 'Enter your password').max(200),
});

/** POST /api/v1/auth/{student|staff|platform}/login — each portal only admits its own roles (decision D1). */
export const POST = defineRoute({
  auth: 'public',
  input: schema,
  handler: async (meta, { input, params, req }) => {
    const slug = String(params.portal);
    if (!Object.hasOwn(PORTAL_SLUGS, slug)) throw new AppError('NOT_FOUND', 'Unknown portal');
    const key = meta.ipHash ? `login-fail:${meta.ipHash}` : null;
    const { limit, windowSeconds } = LIMITS.loginFailures;
    if (key) await assertUnderLimit(key, limit, windowSeconds);
    let result;
    try {
      result = await login({ portal: PORTAL_SLUGS[slug as PortalSlug], ...input }, meta);
    } catch (e) {
      // Only failures count towards the per-network limit (schools share one IP; successful sign-ins are fine).
      if (key && e instanceof AppError && (e.code === 'INVALID_CREDENTIALS' || e.code === 'ACCOUNT_LOCKED'))
        await recordHit(key, windowSeconds);
      throw e;
    }
    // The native app cannot read an httpOnly cookie; it gets the token in the body and keeps it in the keystore.
    const mobile = isMobileClient(req);
    return {
      body: {
        redirectTo: result.redirectTo,
        mustChangePassword: result.mustChangePassword,
        ...(mobile ? { token: result.token, expiresAt: result.expiresAt } : {}),
      },
      cookies: mobile ? [] : [sessionCookie(result.token, result.expiresAt)],
    };
  },
});
