import { defineRoute, idParam } from '@/server/http/route';
import { archiveDownload } from '@/server/school/archives';

/** A closed year's report card PDF. Staff with marks access (teachers: own sections) or the student. */
export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF', 'STUDENT'],
  handler: async (ctx, { params }) => archiveDownload(ctx, idParam(params)),
});
