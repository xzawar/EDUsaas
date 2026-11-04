import { defineRoute } from '@/server/http/route';
import { auditQuery, listAuditLogs } from '@/server/school/auditlog';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'audit.read',
  query: auditQuery,
  handler: async (ctx, { query }) => listAuditLogs(ctx, query),
});
