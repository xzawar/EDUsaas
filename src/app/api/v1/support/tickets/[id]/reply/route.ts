import { defineRoute, idParam } from '@/server/http/route';
import { replySchema, replyToTicket } from '@/server/school/tickets';

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  input: replySchema,
  handler: async (ctx, { input, params }) => replyToTicket(ctx, idParam(params), input),
});
