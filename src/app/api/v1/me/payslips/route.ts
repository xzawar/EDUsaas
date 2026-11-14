import { defineRoute } from '@/server/http/route';
import { myPayslips } from '@/server/school/finance/payroll';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  handler: async (ctx) => ({ items: await myPayslips(ctx) }),
});
