import { defineRoute } from '@/server/http/route';
import { checkIn, checkInSchema } from '@/server/school/attendance';

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'teacher_attendance.self',
  input: checkInSchema,
  handler: async (ctx, { input }) => checkIn(ctx, input),
});
