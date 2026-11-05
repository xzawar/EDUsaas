import { defineRoute, idParam } from '@/server/http/route';
import { setUserStatus, setUserStatusSchema } from '@/server/school/people';

export const PATCH = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'users.manage',
  input: setUserStatusSchema,
  handler: async (ctx, { input, params }) => setUserStatus(ctx, idParam(params), input),
});
