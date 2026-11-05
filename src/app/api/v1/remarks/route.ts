import { defineRoute } from '@/server/http/route';
import { addRemark, remarkSchema } from '@/server/school/assessments';

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'remarks.write',
  input: remarkSchema,
  handler: async (ctx, { input }) => ({ status: 201, body: { remark: await addRemark(ctx, input) } }),
});
