import { defineRoute } from '@/server/http/route';
import { z } from 'zod';
import { createSection, createSectionSchema, listSections } from '@/server/school/structure';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  query: z.object({ yearId: z.string().uuid().optional() }),
  handler: async (ctx, { query }) => ({ items: await listSections(ctx, query.yearId) }),
});

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'structure.manage',
  input: createSectionSchema,
  handler: async (ctx, { input }) => ({ status: 201, body: { section: await createSection(ctx, input) } }),
});
