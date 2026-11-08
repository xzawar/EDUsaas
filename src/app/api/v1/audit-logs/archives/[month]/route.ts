import { auditArchiveDownload } from '@/server/audit/archives';
import { defineRoute } from '@/server/http/route';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'audit.read',
  handler: async (ctx, { params }) => auditArchiveDownload(ctx, String(params.month)),
});
