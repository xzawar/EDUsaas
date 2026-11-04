import { defineRoute, idParam } from '@/server/http/route';
import { updateSubject, updateSubjectSchema } from '@/server/school/structure';

export const PATCH = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'structure.manage',
  input: updateSubjectSchema,
  handler: async (ctx, { input, params }) => ({ subject: await updateSubject(ctx, idParam(params), input) }),
});
