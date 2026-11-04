import { defineRoute } from '@/server/http/route';
import { createTeacher, createTeacherSchema, listTeachers, listTeachersQuery } from '@/server/school/people';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'teachers.read',
  query: listTeachersQuery,
  handler: async (ctx, { query }) => listTeachers(ctx, query),
});

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'teachers.write',
  input: createTeacherSchema,
  handler: async (ctx, { input }) => ({ status: 201, body: await createTeacher(ctx, input) }),
});
