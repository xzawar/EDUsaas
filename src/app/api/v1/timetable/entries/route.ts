import { defineRoute } from '@/server/http/route';
import { setEntry, setEntrySchema } from '@/server/school/timetable';

export const PUT = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'timetable.manage',
  input: setEntrySchema,
  handler: async (ctx, { input }) => setEntry(ctx, input),
});
