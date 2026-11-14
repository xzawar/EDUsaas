import { z } from 'zod';
import { defineRoute } from '@/server/http/route';
import { createFeeHead, feeHeadSchema, listFeeHeads } from '@/server/school/finance/setup';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  anyPermission: ['fees.manage', 'fees.collect', 'finance.read'],
  query: z.object({ archived: z.coerce.boolean().default(false) }),
  handler: async (ctx, { query }) => ({ items: await listFeeHeads(ctx, query.archived) }),
});

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'fees.manage',
  input: feeHeadSchema,
  handler: async (ctx, { input }) => ({ status: 201, body: { head: await createFeeHead(ctx, input) } }),
});
