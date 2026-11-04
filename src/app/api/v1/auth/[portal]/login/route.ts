import { z } from 'zod';
import { defineRoute } from '@/server/http/route';
import { AppError } from '@/server/http/errors';
import { login } from '@/server/auth/service';
import { PORTAL_SLUGS, type PortalSlug } from '@/server/auth/portals';
import { sessionCookie } from '@/server/auth/session';

const schema = z.object({
  identifier: z.string().trim().min(1, 'Enter your username or email').max(200),
  password: z.string().min(1, 'Enter your password').max(200),
});

/** POST /api/v1/auth/{student|staff|platform}/login — each portal only admits its own roles (decision D1). */
export const POST = defineRoute({
  auth: 'public',
  input: schema,
  handler: async (meta, { input, params }) => {
    const slug = String(params.portal);
    if (!Object.hasOwn(PORTAL_SLUGS, slug)) throw new AppError('NOT_FOUND', 'Unknown portal');
    const result = await login({ portal: PORTAL_SLUGS[slug as PortalSlug], ...input }, meta);
    return {
      body: { redirectTo: result.redirectTo, mustChangePassword: result.mustChangePassword },
      cookies: [sessionCookie(result.token, result.expiresAt)],
    };
  },
});
