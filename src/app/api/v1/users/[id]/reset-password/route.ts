import { defineRoute, idParam } from '@/server/http/route';
import { resetUserPassword } from '@/server/school/people';

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'users.manage',
  handler: async (ctx, { params }) => resetUserPassword(ctx, idParam(params)),
});
