import { defineRoute } from '@/server/http/route';
import { applyLeave, applySchema, myLeave } from '@/server/school/leave';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF', 'STUDENT'],
  permission: 'leave.apply',
  handler: async (ctx) => ({ items: await myLeave(ctx) }),
});

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF', 'STUDENT'],
  permission: 'leave.apply',
  input: applySchema,
  handler: async (ctx, { input }) => ({ status: 201, body: { leave: await applyLeave(ctx, input) } }),
});
