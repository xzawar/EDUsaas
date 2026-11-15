import { defineRoute, idParam } from '@/server/http/route';
import { updateLogin, updateLoginSchema } from '@/server/school/people';

/** School Admin sets someone's username, email or password directly. */
export const PATCH = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'users.manage',
  input: updateLoginSchema,
  handler: async (ctx, { input, params }) => updateLogin(ctx, idParam(params), input),
});
