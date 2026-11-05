import { defineRoute, idParam } from '@/server/http/route';
import { deleteClass, updateClass, updateClassSchema } from '@/server/school/structure';

export const PATCH = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'structure.manage',
  input: updateClassSchema,
  handler: async (ctx, { input, params }) => ({ class: await updateClass(ctx, idParam(params), input) }),
});

export const DELETE = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'structure.manage',
  handler: async (ctx, { params }) => deleteClass(ctx, idParam(params)),
});
