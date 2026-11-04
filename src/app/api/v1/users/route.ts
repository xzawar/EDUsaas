import { defineRoute } from '@/server/http/route';
import { listSchoolUsers, listUsersQuery } from '@/server/school/users';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'users.read',
  query: listUsersQuery,
  handler: async (ctx, { query }) => listSchoolUsers(ctx, query),
});
