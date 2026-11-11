import { defineRoute } from '@/server/http/route';
import { createPayrollRun, listPayrollRuns, runSchema } from '@/server/school/finance/payroll';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  anyPermission: ['payroll.manage', 'finance.read'],
  handler: async (ctx) => ({ items: await listPayrollRuns(ctx) }),
});

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'payroll.manage',
  input: runSchema,
  handler: async (ctx, { input }) => ({ status: 201, body: await createPayrollRun(ctx, input) }),
});
