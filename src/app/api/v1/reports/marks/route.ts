import { csvResponse } from '@/server/files/csv';
import { defineRoute } from '@/server/http/route';
import { marksCsv, marksReport, marksReportQuery } from '@/server/school/reports';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'reports.read',
  query: marksReportQuery,
  handler: async (ctx, { query }) => {
    const r = await marksReport(ctx, query);
    if (query.format === 'csv')
      return csvResponse(r.grid ? `marks-${r.grid.section}.csv` : 'marks-summary.csv', marksCsv(r));
    return r;
  },
});
