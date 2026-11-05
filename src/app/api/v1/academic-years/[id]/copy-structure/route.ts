import { defineRoute, idParam } from '@/server/http/route';
import { copyStructure, copyStructureSchema } from '@/server/school/structure';

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'structure.manage',
  input: copyStructureSchema,
  handler: async (ctx, { input, params }) => copyStructure(ctx, idParam(params), input),
});
