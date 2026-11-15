import { defineRoute } from '@/server/http/route';
import { createPaymentAccount, listPaymentAccounts, paymentAccountSchema } from '@/server/school/finance/accounts';

/** The school's bank account and wallets that parents pay into. Students read the active ones. */
export const GET = defineRoute({
  auth: 'user',
  anyPermission: ['fees.manage', 'fees.collect', 'self.fees'],
  handler: async (ctx) => ({ items: await listPaymentAccounts(ctx) }),
});

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'fees.manage',
  input: paymentAccountSchema,
  handler: async (ctx, { input }) => ({ status: 201, body: await createPaymentAccount(ctx, input) }),
});
