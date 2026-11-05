import { defineRoute, idParam } from '@/server/http/route';
import { studentArchives } from '@/server/school/archives';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'students.search',
  handler: async (ctx, { params }) => ({ items: await studentArchives(ctx, idParam(params)) }),
});
