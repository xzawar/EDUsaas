import { defineRoute } from '@/server/http/route';
import { listInvoices, listInvoicesQuery } from '@/server/school/finance/invoices';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  anyPermission: ['fees.collect', 'finance.read'],
  query: listInvoicesQuery,
  handler: async (ctx, { query }) => listInvoices(ctx, query),
});
