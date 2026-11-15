import { defineRoute, idParam } from '@/server/http/route';
import { deletePaymentAccount, paymentAccountSchema, updatePaymentAccount } from '@/server/school/finance/accounts';

export const PATCH = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'fees.manage',
  input: paymentAccountSchema,
  handler: async (ctx, { input, params }) => updatePaymentAccount(ctx, idParam(params), input),
});

export const DELETE = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'fees.manage',
  handler: async (ctx, { params }) => deletePaymentAccount(ctx, idParam(params)),
});
