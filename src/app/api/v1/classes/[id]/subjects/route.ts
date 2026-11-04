import { defineRoute, idParam } from '@/server/http/route';
import { setClassSubjects, setClassSubjectsSchema } from '@/server/school/structure';

export const PUT = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'structure.manage',
  input: setClassSubjectsSchema,
  handler: async (ctx, { input, params }) => setClassSubjects(ctx, idParam(params), input),
});
