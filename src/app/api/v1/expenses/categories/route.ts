import { z } from 'zod';
import { defineRoute } from '@/server/http/route';
import { categorySchema, createCategory, listCategories } from '@/server/school/finance/expenses';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  anyPermission: ['expenses.manage', 'finance.read'],
  query: z.object({ archived: z.coerce.boolean().default(false) }),
  handler: async (ctx, { query }) => ({ items: await listCategories(ctx, query.archived) }),
});

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'expenses.manage',
  input: categorySchema,
  handler: async (ctx, { input }) => ({ status: 201, body: { category: await createCategory(ctx, input) } }),
});
