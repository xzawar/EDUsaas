import { defineRoute, idParam } from '@/server/http/route';
import { addOverride, overrideSchema, studentFeeConfig } from '@/server/school/finance/setup';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  anyPermission: ['fees.manage', 'fees.collect', 'finance.read'],
  handler: async (ctx, { params }) => studentFeeConfig(ctx, idParam(params)),
});

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'fees.manage',
  input: overrideSchema,
  handler: async (ctx, { input, params }) => ({ status: 201, body: await addOverride(ctx, idParam(params), input) }),
});
