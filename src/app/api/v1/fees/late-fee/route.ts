import { z } from 'zod';
import { defineRoute } from '@/server/http/route';
import { lateFeeRule, lateFeeRuleSchema, saveLateFeeRule } from '@/server/school/finance/setup';

const yearQuery = z.object({ yearId: z.string().uuid() });

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  anyPermission: ['fees.manage', 'fees.collect', 'finance.read'],
  query: yearQuery,
  handler: async (ctx, { query }) => ({ rule: await lateFeeRule(ctx, query.yearId) }),
});

export const PUT = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'fees.manage',
  query: yearQuery,
  input: lateFeeRuleSchema,
  handler: async (ctx, { query, input }) => saveLateFeeRule(ctx, query.yearId, input),
});
