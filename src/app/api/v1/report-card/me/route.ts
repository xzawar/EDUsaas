import { defineRoute } from '@/server/http/route';
import { myReportCard } from '@/server/school/reportcard';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STUDENT'],
  permission: 'self.records',
  handler: async (ctx) => myReportCard(ctx),
});
