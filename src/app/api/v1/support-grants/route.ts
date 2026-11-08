import { defineRoute } from '@/server/http/route';
import { listSupportGrants } from '@/server/school/support';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'settings.manage',
  handler: async (ctx) => ({ items: await listSupportGrants(ctx) }),
});
