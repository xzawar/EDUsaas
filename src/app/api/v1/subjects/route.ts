import { defineRoute } from '@/server/http/route';
import { createSubject, listSubjects, subjectSchema } from '@/server/school/structure';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  handler: async (ctx) => ({ items: await listSubjects(ctx) }),
});

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'structure.manage',
  input: subjectSchema,
  handler: async (ctx, { input }) => ({ status: 201, body: { subject: await createSubject(ctx, input) } }),
});
