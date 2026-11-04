import { defineRoute, idParam } from '@/server/http/route';
import { cancelLeave } from '@/server/school/leave';

export const POST = defineRoute({ auth: 'user', portals: ['STAFF', 'STUDENT'], permission: 'leave.apply', handler: async (ctx, { params }) => cancelLeave(ctx, idParam(params)) });
