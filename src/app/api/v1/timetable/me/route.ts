import { defineRoute } from '@/server/http/route';
import { myTimetable } from '@/server/school/timetable';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF', 'STUDENT'],
  permission: 'timetable.view',
  handler: async (ctx) => myTimetable(ctx),
});
