import { defineRoute, idParam } from '@/server/http/route';
import { payRun, paySchema } from '@/server/school/finance/payroll';

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'payroll.manage',
  input: paySchema,
  handler: async (ctx, { input, params }) => payRun(ctx, idParam(params), input),
});
