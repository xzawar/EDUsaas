import { defineRoute } from '@/server/http/route';
import { attendanceSections } from '@/server/school/attendance';

/** Today's registers: teachers see their own sections, overseers the whole school. */
export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  anyPermission: ['attendance.submit', 'attendance.oversee'],
  handler: async (ctx) => attendanceSections(ctx),
});
