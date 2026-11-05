import { defineRoute, idParam } from '@/server/http/route';
import { closeMyTicket } from '@/server/school/tickets';

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  handler: async (ctx, { params }) => closeMyTicket(ctx, idParam(params)),
});
