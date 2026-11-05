import { defineRoute, idParam } from '@/server/http/route';
import { ticketDetail } from '@/server/platform/tickets';

export const GET = defineRoute({
  auth: 'user',
  portals: ['PLATFORM'],
  permission: 'platform.support.queue',
  handler: async (_ctx, { params }) => ({ ticket: await ticketDetail(idParam(params)) }),
});
