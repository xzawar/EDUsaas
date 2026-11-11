import { defineRoute, idParam } from '@/server/http/route';
import { addDiscount, discountSchema } from '@/server/school/finance/setup';

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'fees.manage',
  input: discountSchema,
  handler: async (ctx, { input, params }) => ({ status: 201, body: await addDiscount(ctx, idParam(params), input) }),
});
