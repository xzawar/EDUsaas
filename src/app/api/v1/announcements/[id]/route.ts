import { defineRoute, idParam } from '@/server/http/route';
import { deleteAnnouncement } from '@/server/school/announcements';

export const DELETE = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'announcements.manage',
  handler: async (ctx, { params }) => deleteAnnouncement(ctx, idParam(params)),
});
