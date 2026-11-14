import { defineRoute, idParam } from '@/server/http/route';
import { finaliseRun } from '@/server/school/finance/payroll';

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'payroll.manage',
  handler: async (ctx, { params }) => finaliseRun(ctx, idParam(params)),
});
