import { defineRoute } from '@/server/http/route';
import { recentImports } from '@/server/school/imports';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'students.import',
  handler: async (ctx) => ({ items: await recentImports(ctx) }),
});
