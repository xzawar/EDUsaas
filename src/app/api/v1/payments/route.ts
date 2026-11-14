import { defineRoute } from '@/server/http/route';
import { paymentSchema, recordPayment } from '@/server/school/finance/payments';

/** Takes a payment at the counter. `clientKey` makes a resend from the offline queue a no-op. */
export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'fees.collect',
  input: paymentSchema,
  handler: async (ctx, { input }) => {
    const r = await recordPayment(ctx, input);
    return { status: r.duplicate ? 200 : 201, body: r };
  },
});
