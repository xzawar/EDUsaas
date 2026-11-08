import { defineRoute } from '@/server/http/route';
import { myArchives } from '@/server/school/archives';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STUDENT'],
  permission: 'self.records',
  handler: async (ctx) => ({ items: await myArchives(ctx) }),
});
