import { defineRoute } from '@/server/http/route';
import { z } from 'zod';
import { attendanceSheet } from '@/server/school/attendance';

/** Access (assigned teacher / Class Incharge / overseer) is checked in the service. */
export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  query: z.object({
    sectionId: z.string().uuid(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  }),
  handler: async (ctx, { query }) => attendanceSheet(ctx, query.sectionId, query.date),
});
