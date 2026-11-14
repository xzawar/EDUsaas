import { defineRoute, idParam } from '@/server/http/route';
import { claimProof } from '@/server/school/finance/claims';

/** The uploaded proof image: office staff, or the student who sent it. */
export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF', 'STUDENT'],
  anyPermission: ['fees.collect', 'finance.read', 'self.fees'],
  handler: async (ctx, { params }) => claimProof(ctx, idParam(params)),
});
