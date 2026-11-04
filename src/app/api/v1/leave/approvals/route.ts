import { defineRoute } from '@/server/http/route';
import { z } from 'zod';
import { approvalQueue } from '@/server/school/leave';

/** Scoped in the service: Class Incharge (own students), Principal (staff, if allowed), School Admin (all). */
export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  query: z.object({ status: z.enum(['PENDING', 'DECIDED']).default('PENDING') }),
  handler: async (ctx, { query }) => ({ items: await approvalQueue(ctx, query.status) }),
});
