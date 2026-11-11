import { defineRoute } from '@/server/http/route';
import { salaryRoster } from '@/server/school/finance/payroll';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'payroll.manage',
  handler: async (ctx) => ({ items: await salaryRoster(ctx) }),
});
