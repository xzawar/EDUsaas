import { defineRoute } from '@/server/http/route';
import { expenseSchema, listExpenses, listExpensesQuery, recordExpense } from '@/server/school/finance/expenses';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  anyPermission: ['expenses.manage', 'finance.read'],
  query: listExpensesQuery,
  handler: async (ctx, { query }) => listExpenses(ctx, query),
});

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'expenses.manage',
  maxBodyBytes: 500_000,
  input: expenseSchema,
  handler: async (ctx, { input }) => {
    const r = await recordExpense(ctx, input);
    return { status: r.duplicate ? 200 : 201, body: r };
  },
});
