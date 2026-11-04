import { defineRoute } from '@/server/http/route';
import { remarksQueue } from '@/server/school/assessments';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  handler: async (ctx) => ({ items: await remarksQueue(ctx) }),
});
