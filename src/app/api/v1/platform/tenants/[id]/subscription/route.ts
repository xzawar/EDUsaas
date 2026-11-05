import { defineRoute, idParam } from '@/server/http/route';
import { setSubscription, subscriptionSchema, tenantSubscription } from '@/server/platform/plans';

export const GET = defineRoute({
  auth: 'user',
  portals: ['PLATFORM'],
  permission: 'platform.plans.manage',
  handler: async (_ctx, { params }) => tenantSubscription(idParam(params)),
});
export const PUT = defineRoute({
  auth: 'user',
  portals: ['PLATFORM'],
  permission: 'platform.plans.manage',
  input: subscriptionSchema,
  handler: async (ctx, { input, params }) => setSubscription(ctx, idParam(params), input),
});
