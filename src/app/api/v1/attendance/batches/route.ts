import { defineRoute } from '@/server/http/route';
import { submitAttendance, submitSchema } from '@/server/school/attendance';

export const POST = defineRoute({ auth: 'user', portals: ['STAFF'], input: submitSchema, handler: async (ctx, { input }) => submitAttendance(ctx, input) });
