import { defineRoute } from '@/server/http/route';
import { clearedSessionCookie, revokeSession } from '@/server/auth/session';
import { recordAudit } from '@/server/audit/audit';
import { PORTAL_LOGIN } from '@/server/auth/portals';

/** Logout revokes the session server-side, not just the cookie (spec §3.4). */
export const POST = defineRoute({
  auth: 'user',
  allowPendingPasswordChange: true,
  handler: async (ctx) => {
    await revokeSession(ctx.session.sessionId);
    await recordAudit({
      tenantId: ctx.tenantId,
      actorId: ctx.user.id,
      actorRole: ctx.user.role,
      action: 'auth.logout',
      entity: 'User',
      entityId: ctx.user.id,
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
    });
    return { body: { redirectTo: PORTAL_LOGIN[ctx.session.portal] }, cookies: [clearedSessionCookie()] };
  },
});
