import { defineRoute } from '@/server/http/route';
import { createStudent, createStudentSchema, listStudents, listStudentsQuery } from '@/server/school/people';

/** Role-scoped: teachers only see students in their own sections (spec §4). */
export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'students.search',
  query: listStudentsQuery,
  handler: async (ctx, { query }) => listStudents(ctx, query),
});

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'students.write',
  input: createStudentSchema,
  handler: async (ctx, { input }) => ({ status: 201, body: await createStudent(ctx, input) }),
});
