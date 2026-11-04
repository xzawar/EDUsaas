import { defineRoute } from '@/server/http/route';
import { z } from 'zod';
import { sectionGrid } from '@/server/school/attendance';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  query: z.object({
    sectionId: z.string().uuid(),
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional(),
  }),
  handler: async (ctx, { query }) => sectionGrid(ctx, query.sectionId, query.month),
});
