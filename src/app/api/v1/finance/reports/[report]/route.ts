import { z } from 'zod';
import { csvResponse } from '@/server/files/csv';
import { AppError } from '@/server/http/errors';
import { defineRoute } from '@/server/http/route';
import {
  dailyCollection,
  dailyCollectionCsv,
  defaulters,
  defaultersCsv,
  incomeExpense,
  incomeExpenseCsv,
  monthSummary,
  monthSummaryCsv,
  reportQuery,
  studentLedger,
  studentLedgerCsv,
} from '@/server/school/finance/reports';

const REPORTS = ['daily', 'defaulters', 'income-expense', 'summary', 'student-ledger'] as const;

/** One route, five reports: ?format=csv downloads for Excel. */
export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'finance.read',
  query: reportQuery,
  handler: async (ctx, { query, params }) => {
    const report = z.enum(REPORTS).safeParse(params.report);
    if (!report.success) throw new AppError('NOT_FOUND', 'Unknown report');
    const csv = query.format === 'csv';
    switch (report.data) {
      case 'daily': {
        const r = await dailyCollection(ctx, query);
        return csv ? csvResponse(`collection-${r.from}-${r.to}.csv`, dailyCollectionCsv(r)) : r;
      }
      case 'defaulters': {
        const r = await defaulters(ctx, query);
        return csv ? csvResponse(`defaulters-${r.asOf}.csv`, defaultersCsv(r)) : r;
      }
      case 'income-expense': {
        const r = await incomeExpense(ctx, query);
        return csv ? csvResponse(`income-expense-${r.year.name}.csv`, incomeExpenseCsv(r)) : r;
      }
      case 'summary': {
        const r = await monthSummary(ctx, query);
        return csv ? csvResponse(`summary-${r.period}.csv`, monthSummaryCsv(r)) : r;
      }
      case 'student-ledger': {
        if (!query.studentId) throw new AppError('VALIDATION_FAILED', 'studentId is required');
        const r = await studentLedger(ctx, query.studentId);
        return csv ? csvResponse(`ledger-${r.student.username ?? r.student.id}.csv`, studentLedgerCsv(r)) : r;
      }
    }
  },
});
