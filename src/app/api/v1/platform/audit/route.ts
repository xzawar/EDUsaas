import { defineRoute } from '@/server/http/route';
import { platformAudit, platformAuditQuery } from '@/server/platform/audit';

export const GET = defineRoute({
  auth: 'user',
  portals: ['PLATFORM'],
  permission: 'platform.audit.read',
  query: platformAuditQuery,
  handler: async (_ctx, { query }) => platformAudit(query),
});
