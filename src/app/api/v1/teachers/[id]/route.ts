import { defineRoute, idParam } from '@/server/http/route';
import { getTeacher, updateTeacher, updateTeacherSchema } from '@/server/school/people';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'teachers.read',
  handler: async (ctx, { params }) => ({ teacher: await getTeacher(ctx, idParam(params)) }),
});

export const PATCH = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'teachers.write',
  input: updateTeacherSchema,
  handler: async (ctx, { input, params }) => updateTeacher(ctx, idParam(params), input),
});
