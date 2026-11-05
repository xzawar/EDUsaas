import { defineRoute } from '@/server/http/route';
import { createAnnouncement, createAnnouncementSchema, listAnnouncements } from '@/server/school/announcements';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF', 'STUDENT'],
  handler: async (ctx) => ({ items: await listAnnouncements(ctx) }),
});

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'announcements.manage',
  input: createAnnouncementSchema,
  handler: async (ctx, { input }) => ({ status: 201, body: await createAnnouncement(ctx, input) }),
});
