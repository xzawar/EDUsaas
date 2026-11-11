import { defineRoute } from '@/server/http/route';
import { listClaims, listClaimsQuery } from '@/server/school/finance/claims';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  anyPermission: ['fees.collect', 'finance.read'],
  query: listClaimsQuery,
  handler: async (ctx, { query }) => listClaims(ctx, query),
});
