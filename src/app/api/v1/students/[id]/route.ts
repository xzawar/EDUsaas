import { defineRoute, idParam } from '@/server/http/route';
import { getStudent, updateStudent, updateStudentSchema } from '@/server/school/people';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'students.search',
  handler: async (ctx, { params }) => ({ student: await getStudent(ctx, idParam(params)) }),
});

export const PATCH = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'students.write',
  input: updateStudentSchema,
  handler: async (ctx, { input, params }) => updateStudent(ctx, idParam(params), input),
});
