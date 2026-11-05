import { defineRoute, idParam } from '@/server/http/route';
import { deleteSection, updateSection, updateSectionSchema } from '@/server/school/structure';

export const PATCH = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'structure.manage',
  input: updateSectionSchema,
  handler: async (ctx, { input, params }) => ({ section: await updateSection(ctx, idParam(params), input) }),
});

export const DELETE = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'structure.manage',
  handler: async (ctx, { params }) => deleteSection(ctx, idParam(params)),
});
