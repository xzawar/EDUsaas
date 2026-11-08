import { defineRoute, idParam } from '@/server/http/route';
import { planSchema, updatePlan } from '@/server/platform/plans';

export const PUT = defineRoute({
  auth: 'user',
  portals: ['PLATFORM'],
  permission: 'platform.plans.manage',
  input: planSchema,
  handler: async (ctx, { input, params }) => ({ plan: await updatePlan(ctx, idParam(params), input) }),
});
