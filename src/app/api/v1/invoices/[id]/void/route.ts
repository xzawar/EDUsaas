import { z } from 'zod';
import { defineRoute, idParam } from '@/server/http/route';
import { voidInvoice } from '@/server/school/finance/invoices';

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'fees.collect',
  input: z.object({ reason: z.string().trim().min(3).max(200) }),
  handler: async (ctx, { input, params }) => voidInvoice(ctx, idParam(params), input.reason),
});
