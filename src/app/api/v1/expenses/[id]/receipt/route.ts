import { defineRoute, idParam } from '@/server/http/route';
import { expenseReceipt } from '@/server/school/finance/expenses';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  anyPermission: ['expenses.manage', 'finance.read'],
  handler: async (ctx, { params }) => expenseReceipt(ctx, idParam(params)),
});
