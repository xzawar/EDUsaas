import { defineRoute, idParam } from '@/server/http/route';
import { endDiscount } from '@/server/school/finance/setup';

/** Ends a discount from today; discounts are never deleted. */
export const DELETE = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'fees.manage',
  handler: async (ctx, { params }) => endDiscount(ctx, idParam(params), idParam(params, 'discountId')),
});
