import { defineRoute, idParam } from '@/server/http/route';
import { getImport } from '@/server/school/imports';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'students.import',
  handler: async (ctx, { params }) => ({ import: await getImport(ctx, idParam(params)) }),
});
