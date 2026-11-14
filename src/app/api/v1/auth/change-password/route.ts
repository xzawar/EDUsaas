import { z } from 'zod';
import { isMobileClient } from '@/server/http/request';
import { defineRoute } from '@/server/http/route';
import { changePassword } from '@/server/auth/service';
import { newPasswordSchema } from '@/server/auth/password';
import { sessionCookie } from '@/server/auth/session';

const schema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: newPasswordSchema });

export const POST = defineRoute({
  auth: 'user',
  allowPendingPasswordChange: true,
  input: schema,
  handler: async (ctx, { input, req }) => {
    const result = await changePassword(
      { userId: ctx.user.id, portal: ctx.session.portal, ...input },
      { requestId: ctx.requestId, ipHash: ctx.ipHash, userAgent: ctx.userAgent },
    );
    // The old session is revoked; the native app gets its replacement in the body (it cannot read cookies).
    if (isMobileClient(req))
      return { body: { redirectTo: result.redirectTo, token: result.token, expiresAt: result.expiresAt }, cookies: [] };
    return { body: { redirectTo: result.redirectTo }, cookies: [sessionCookie(result.token, result.expiresAt)] };
  },
});
