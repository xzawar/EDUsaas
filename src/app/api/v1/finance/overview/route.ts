import { defineRoute } from '@/server/http/route';
import { financeOverview } from '@/server/school/finance/overview';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  anyPermission: ['finance.read', 'fees.collect'],
  handler: async (ctx) => financeOverview(ctx),
});
