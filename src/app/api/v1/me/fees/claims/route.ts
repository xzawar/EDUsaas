import { defineRoute } from '@/server/http/route';
import { claimSchema, myClaims, submitClaim } from '@/server/school/finance/claims';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STUDENT'],
  permission: 'self.fees',
  handler: async (ctx) => myClaims(ctx),
});

/** "I have paid": amount, method, reference and a photo of the proof. */
export const POST = defineRoute({
  auth: 'user',
  portals: ['STUDENT'],
  permission: 'self.fees',
  maxBodyBytes: 500_000,
  input: claimSchema,
  handler: async (ctx, { input }) => {
    const r = await submitClaim(ctx, input);
    return { status: r.duplicate ? 200 : 201, body: r };
  },
});
