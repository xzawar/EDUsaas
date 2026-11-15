import { defineRoute, idParam } from '@/server/http/route';
import { studentProfileOverview } from '@/server/school/dashboard';

/** Attendance and results for one student: the class incharge, School Admin and report readers. */
export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'students.search',
  handler: async (ctx, { params }) => studentProfileOverview(ctx, idParam(params)),
});
