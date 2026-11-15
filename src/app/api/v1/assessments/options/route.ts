import { defineRoute } from '@/server/http/route';
import { teachOptions } from '@/server/school/assessments';

/** The (class, subject) pairs the caller can create a test for. */
export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  anyPermission: ['marks.enter', 'marks.manage'],
  handler: async (ctx) => ({ items: await teachOptions(ctx) }),
});
