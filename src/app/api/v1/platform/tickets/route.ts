import { defineRoute } from '@/server/http/route';
import { ticketQuery, ticketQueue } from '@/server/platform/tickets';

export const GET = defineRoute({
  auth: 'user',
  portals: ['PLATFORM'],
  permission: 'platform.support.queue',
  query: ticketQuery,
  handler: async (_ctx, { query }) => ticketQueue(query),
});
