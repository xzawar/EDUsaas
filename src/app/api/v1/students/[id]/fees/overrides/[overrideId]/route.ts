import { defineRoute, idParam } from '@/server/http/route';
import { removeOverride } from '@/server/school/finance/setup';

export const DELETE = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'fees.manage',
  handler: async (ctx, { params }) => removeOverride(ctx, idParam(params), idParam(params, 'overrideId')),
});
