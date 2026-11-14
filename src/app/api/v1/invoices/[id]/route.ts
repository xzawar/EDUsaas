import { defineRoute, idParam } from '@/server/http/route';
import { invoiceDetail } from '@/server/school/finance/invoices';

/** Staff with finance access, or the student the bill belongs to. */
export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF', 'STUDENT'],
  anyPermission: ['fees.collect', 'finance.read', 'self.fees'],
  handler: async (ctx, { params }) => ({ invoice: await invoiceDetail(ctx, idParam(params)) }),
});
