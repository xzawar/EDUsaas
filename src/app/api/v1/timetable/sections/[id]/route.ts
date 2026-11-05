import { defineRoute, idParam } from '@/server/http/route';
import { sectionTimetable } from '@/server/school/timetable';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'timetable.view',
  handler: async (ctx, { params }) => sectionTimetable(ctx, idParam(params)),
});
