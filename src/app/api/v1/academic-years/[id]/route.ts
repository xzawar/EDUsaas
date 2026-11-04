import { defineRoute, idParam } from '@/server/http/route';
import { updateYear, updateYearSchema } from '@/server/school/structure';

export const PATCH = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'structure.manage',
  input: updateYearSchema,
  handler: async (ctx, { input, params }) => ({ year: await updateYear(ctx, idParam(params), input) }),
});
