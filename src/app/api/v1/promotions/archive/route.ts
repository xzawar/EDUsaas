import { defineRoute } from '@/server/http/route';
import { yearArchiveJobs } from '@/server/school/archives';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'promotion.run',
  handler: async (ctx) => ({ items: await yearArchiveJobs(ctx) }),
});
