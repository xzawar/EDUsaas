import { defineRoute, idParam } from '@/server/http/route';
import { commitImport } from '@/server/school/imports';

/** Creates the next chunk (≤ 100) of students. Call until `finished`; safe to retry. */
export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'students.import',
  handler: async (ctx, { params }) => commitImport(ctx, idParam(params)),
});
