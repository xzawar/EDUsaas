import { defineRoute, idParam } from '@/server/http/route';
import { studentFees } from '@/server/school/finance/invoices';

/** The counter view: outstanding bills, receipts and claims for one student. */
export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  anyPermission: ['fees.collect', 'finance.read'],
  handler: async (ctx, { params }) => studentFees(ctx, idParam(params)),
});
