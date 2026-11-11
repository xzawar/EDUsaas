import { defineRoute, idParam } from '@/server/http/route';
import { salaryStructure, salaryStructureSchema, saveSalaryStructure } from '@/server/school/finance/payroll';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'payroll.manage',
  handler: async (ctx, { params }) => salaryStructure(ctx, idParam(params, 'userId')),
});

export const PUT = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'payroll.manage',
  input: salaryStructureSchema,
  handler: async (ctx, { input, params }) => saveSalaryStructure(ctx, idParam(params, 'userId'), input),
});
