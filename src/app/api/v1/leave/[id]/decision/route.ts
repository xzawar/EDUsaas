import { defineRoute, idParam } from '@/server/http/route';
import { decideLeave, decideSchema } from '@/server/school/leave';

export const POST = defineRoute({ auth: 'user', portals: ['STAFF'], input: decideSchema, handler: async (ctx, { input, params }) => decideLeave(ctx, idParam(params), input) });
