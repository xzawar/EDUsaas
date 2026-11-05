import { defineRoute } from '@/server/http/route';
import { myTickets, newTicketSchema, openTicket } from '@/server/school/tickets';

/** School Admin / Principal ↔ EDUsaas support. */
export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  handler: async (ctx) => ({ items: await myTickets(ctx) }),
});
export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  input: newTicketSchema,
  handler: async (ctx, { input }) => ({ status: 201, body: await openTicket(ctx, input) }),
});
