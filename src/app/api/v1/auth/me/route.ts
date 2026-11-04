import { defineRoute } from '@/server/http/route';

export const GET = defineRoute({
  auth: 'user',
  allowPendingPasswordChange: true,
  handler: async (ctx) => ({
    user: ctx.user,
    portal: ctx.session.portal,
    tenant: ctx.session.tenant,
    permissions: [...ctx.permissions].sort(),
  }),
});
