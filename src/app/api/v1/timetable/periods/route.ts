import { defineRoute } from '@/server/http/route';
import { getPeriods, periodsSchema, savePeriods } from '@/server/school/timetable';

export const GET = defineRoute({ auth: 'user', portals: ['STAFF', 'STUDENT'], handler: async (ctx) => getPeriods(ctx) });

export const PUT = defineRoute({ auth: 'user', portals: ['STAFF'], permission: 'timetable.manage', input: periodsSchema, handler: async (ctx, { input }) => savePeriods(ctx, input) });
