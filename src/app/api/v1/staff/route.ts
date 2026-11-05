import { defineRoute } from '@/server/http/route';
import { createStaff, createStaffSchema } from '@/server/school/people';

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'users.manage',
  input: createStaffSchema,
  handler: async (ctx, { input }) => ({ status: 201, body: await createStaff(ctx, input) }),
});
