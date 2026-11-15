import { defineRoute } from '@/server/http/route';
import { schoolPlan } from '@/server/platform/plans';

/** The school's EDUsaas package and the plans on offer (School Admin). */
export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'settings.manage',
  handler: async (ctx) => schoolPlan(ctx.tenantId!),
});
