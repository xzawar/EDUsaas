import { defineRoute } from '@/server/http/route';
import { generateInvoicesFor, generateSchema } from '@/server/school/finance/invoices';

/** Creates the month's fee bills (idempotent per student + month). */
export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'fees.collect',
  input: generateSchema,
  handler: async (ctx, { input }) => generateInvoicesFor(ctx, input),
});
