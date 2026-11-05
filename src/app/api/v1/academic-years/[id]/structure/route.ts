import { defineRoute, idParam } from '@/server/http/route';
import { getStructure } from '@/server/school/structure';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  handler: async (ctx, { params }) => getStructure(ctx, idParam(params)),
});
