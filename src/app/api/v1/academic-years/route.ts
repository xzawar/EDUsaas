import { defineRoute } from '@/server/http/route';
import { createYear, createYearSchema, listYears } from '@/server/school/structure';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  handler: async (ctx) => ({ items: await listYears(ctx) }),
});

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'structure.manage',
  input: createYearSchema,
  handler: async (ctx, { input }) => ({ status: 201, body: { year: await createYear(ctx, input) } }),
});
