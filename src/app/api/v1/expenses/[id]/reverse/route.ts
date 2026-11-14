import { z } from 'zod';
import { defineRoute, idParam } from '@/server/http/route';
import { reverseExpense } from '@/server/school/finance/expenses';

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'expenses.manage',
  input: z.object({ reason: z.string().trim().min(3).max(200) }),
  handler: async (ctx, { input, params }) => reverseExpense(ctx, idParam(params), input.reason),
});
