import { csvResponse } from '@/server/files/csv';
import { defineRoute } from '@/server/http/route';
import { attendanceCsv, attendanceReport, attendanceReportQuery } from '@/server/school/reports';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'reports.read',
  query: attendanceReportQuery,
  handler: async (ctx, { query }) => {
    const r = await attendanceReport(ctx, query);
    if (query.format === 'csv') {
      const name =
        r.kind === 'section'
          ? `attendance-${r.section.label}-${r.from}-to-${r.to}.csv`
          : `attendance-${r.from}-to-${r.to}.csv`;
      return csvResponse(name, attendanceCsv(r));
    }
    return r;
  },
});
