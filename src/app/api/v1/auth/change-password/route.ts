import { z } from 'zod';
import { defineRoute } from '@/server/http/route';
import { changePassword } from '@/server/auth/service';
import { newPasswordSchema } from '@/server/auth/password';
import { sessionCookie } from '@/server/auth/session';

const schema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: newPasswordSchema });

export const POST = defineRoute({
  auth: 'user',
  allowPendingPasswordChange: true,
  input: schema,
  handler: async (ctx, { input }) => {
    const result = await changePassword(
      { userId: ctx.user.id, portal: ctx.session.portal, ...input },
      { requestId: ctx.requestId, ipHash: ctx.ipHash, userAgent: ctx.userAgent },
    );
    return { body: { redirectTo: result.redirectTo }, cookies: [sessionCookie(result.token, result.expiresAt)] };
  },
});
