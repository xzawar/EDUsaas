import { z } from 'zod';
import { defineRoute } from '@/server/http/route';
import { copyFeeStructure, feeStructure, feeStructureSchema, saveFeeStructure } from '@/server/school/finance/setup';

const yearQuery = z.object({ yearId: z.string().uuid() });

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  anyPermission: ['fees.manage', 'fees.collect', 'finance.read'],
  query: yearQuery,
  handler: async (ctx, { query }) => feeStructure(ctx, query.yearId),
});

export const PUT = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'fees.manage',
  query: yearQuery,
  input: feeStructureSchema,
  handler: async (ctx, { query, input }) => saveFeeStructure(ctx, query.yearId, input),
});

/** Copy another year's amounts into this year (by class name). */
export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'fees.manage',
  query: yearQuery,
  input: z.object({ fromYearId: z.string().uuid() }),
  handler: async (ctx, { query, input }) => copyFeeStructure(ctx, query.yearId, input.fromYearId),
});
