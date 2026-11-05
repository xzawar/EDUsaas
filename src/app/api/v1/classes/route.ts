import { defineRoute } from '@/server/http/route';
import { createClass, createClassSchema } from '@/server/school/structure';

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'structure.manage',
  input: createClassSchema,
  handler: async (ctx, { input }) => ({ status: 201, body: { class: await createClass(ctx, input) } }),
});
