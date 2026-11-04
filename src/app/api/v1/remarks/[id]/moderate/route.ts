import { defineRoute, idParam } from '@/server/http/route';
import { moderateRemark, moderateSchema } from '@/server/school/assessments';

export const POST = defineRoute({ auth: 'user', portals: ['STAFF'], input: moderateSchema, handler: async (ctx, { input, params }) => moderateRemark(ctx, idParam(params), input) });
