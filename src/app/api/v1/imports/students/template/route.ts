import { xlsxResponse } from '@/server/files/xlsx';
import { defineRoute } from '@/server/http/route';
import { importTemplate } from '@/server/school/imports';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'students.import',
  handler: async (ctx) => xlsxResponse('student-import-template.xlsx', await importTemplate(ctx)),
});
