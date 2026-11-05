import { defineRoute, idParam } from '@/server/http/route';
import { restoreStudent } from '@/server/school/people';

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'students.write',
  handler: async (ctx, { params }) => restoreStudent(ctx, idParam(params)),
});
