import { defineRoute, idParam } from '@/server/http/route';
import { setAssignments, setAssignmentsSchema } from '@/server/school/people';

export const PUT = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'teachers.write',
  input: setAssignmentsSchema,
  handler: async (ctx, { input, params }) => setAssignments(ctx, idParam(params), input),
});
