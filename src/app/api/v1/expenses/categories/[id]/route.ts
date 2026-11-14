import { defineRoute, idParam } from '@/server/http/route';
import { updateCategory, updateCategorySchema } from '@/server/school/finance/expenses';

export const PATCH = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'expenses.manage',
  input: updateCategorySchema,
  handler: async (ctx, { input, params }) => ({ category: await updateCategory(ctx, idParam(params), input) }),
});
