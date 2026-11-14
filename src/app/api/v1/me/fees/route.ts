import { defineRoute } from '@/server/http/route';
import { myFees } from '@/server/school/finance/invoices';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STUDENT'],
  permission: 'self.fees',
  handler: async (ctx) => myFees(ctx),
});
