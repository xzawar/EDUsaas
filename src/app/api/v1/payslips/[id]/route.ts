import { defineRoute, idParam } from '@/server/http/route';
import { payslipPdf } from '@/server/school/finance/payslip-pdf';

/** PDF payslip: the staff member it belongs to, or payroll staff. */
export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  handler: async (ctx, { params }) => payslipPdf(ctx, idParam(params)),
});
