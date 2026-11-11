import { defineRoute, idParam } from '@/server/http/route';
import { deleteDraftRun, payrollRun } from '@/server/school/finance/payroll';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  anyPermission: ['payroll.manage', 'finance.read'],
  handler: async (ctx, { params }) => ({ run: await payrollRun(ctx, idParam(params)) }),
});

/** Only a draft can be deleted. */
export const DELETE = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'payroll.manage',
  handler: async (ctx, { params }) => deleteDraftRun(ctx, idParam(params)),
});
