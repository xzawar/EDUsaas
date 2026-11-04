import { csvResponse } from '@/server/files/csv';
import { defineRoute } from '@/server/http/route';
import { atRiskCsv, atRiskQuery, atRiskReport } from '@/server/school/reports';

/** Guardian contact details are included only for the School Admin (spec §8.10). */
export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'reports.read',
  query: atRiskQuery,
  handler: async (ctx, { query }) => {
    const r = await atRiskReport(ctx);
    return query.format === 'csv' ? csvResponse('at-risk-students.csv', atRiskCsv(r)) : r;
  },
});
