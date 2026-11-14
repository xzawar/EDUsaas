import { defineRoute, idParam } from '@/server/http/route';
import { decideClaim, decideSchema } from '@/server/school/finance/claims';

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'fees.collect',
  input: decideSchema,
  handler: async (ctx, { input, params }) => decideClaim(ctx, idParam(params), input),
});
