import { defineRoute } from '@/server/http/route';
import { z } from 'zod';
import { setTeacherAttendance, setTeacherAttendanceSchema, teacherBoard } from '@/server/school/attendance';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'teacher_attendance.oversee',
  query: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
  handler: async (ctx, { query }) => teacherBoard(ctx, query.date),
});

export const PUT = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'teacher_attendance.oversee',
  input: setTeacherAttendanceSchema,
  handler: async (ctx, { input }) => setTeacherAttendance(ctx, input),
});
