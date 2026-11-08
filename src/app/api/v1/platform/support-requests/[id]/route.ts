import { defineRoute, idParam } from '@/server/http/route';
import { ownerDecision, ownerDecisionSchema } from '@/server/platform/support';

export const POST = defineRoute({
  auth: 'user',
  portals: ['PLATFORM'],
  permission: 'platform.tenants.manage',
  input: ownerDecisionSchema,
  handler: async (ctx, { input, params }) => ownerDecision(ctx, idParam(params), input),
});
