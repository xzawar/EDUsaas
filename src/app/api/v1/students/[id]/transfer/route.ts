import { defineRoute, idParam } from '@/server/http/route';
import { transferStudent, transferSchema } from '@/server/school/people';

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'students.write',
  input: transferSchema,
  handler: async (ctx, { input, params }) => transferStudent(ctx, idParam(params), input),
});
