import { defineRoute } from '@/server/http/route';
import { createLeaveType, leaveTypeSchema, leaveTypes } from '@/server/school/leave';

export const GET = defineRoute({ auth: 'user', portals: ['STAFF', 'STUDENT'], handler: async (ctx) => ({ items: await leaveTypes(ctx) }) });

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'settings.manage',
  input: leaveTypeSchema,
  handler: async (ctx, { input }) => ({ status: 201, body: { type: await createLeaveType(ctx, input) } }),
});
