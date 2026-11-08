import { defineRoute } from '@/server/http/route';
import { createPlan, listPlans, planSchema } from '@/server/platform/plans';

export const GET = defineRoute({
  auth: 'user',
  portals: ['PLATFORM'],
  permission: 'platform.plans.manage',
  handler: async () => ({ items: await listPlans() }),
});
export const POST = defineRoute({
  auth: 'user',
  portals: ['PLATFORM'],
  permission: 'platform.plans.manage',
  input: planSchema,
  handler: async (ctx, { input }) => ({ status: 201, body: { plan: await createPlan(ctx, input) } }),
});
