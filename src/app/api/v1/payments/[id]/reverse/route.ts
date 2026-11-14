import { defineRoute, idParam } from '@/server/http/route';
import { reversePayment, reverseSchema } from '@/server/school/finance/payments';

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'fees.collect',
  input: reverseSchema,
  handler: async (ctx, { input, params }) => reversePayment(ctx, idParam(params), input),
});
