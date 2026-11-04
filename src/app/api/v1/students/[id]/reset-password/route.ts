import { defineRoute, idParam } from '@/server/http/route';
import { resetStudentPassword } from '@/server/school/people';

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'students.reset_password',
  handler: async (ctx, { params }) => resetStudentPassword(ctx, idParam(params)),
});
