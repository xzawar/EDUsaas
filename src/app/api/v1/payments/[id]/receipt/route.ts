import { defineRoute, idParam } from '@/server/http/route';
import { receiptPdf } from '@/server/school/finance/receipt-pdf';

/** PDF receipt: the school office, or the student it belongs to. */
export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF', 'STUDENT'],
  anyPermission: ['fees.collect', 'finance.read', 'self.fees'],
  handler: async (ctx, { params }) => receiptPdf(ctx, idParam(params)),
});
