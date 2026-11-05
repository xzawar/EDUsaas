import { defineRoute, idParam } from '@/server/http/route';
import { applyRenumber, previewRenumber, renumberSchema } from '@/server/school/people';

/** School Admin (any section) or the section's Class Incharge; checked in the service. */
export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  handler: async (ctx, { params }) => previewRenumber(ctx, idParam(params)),
});

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  input: renumberSchema,
  handler: async (ctx, { input, params }) => applyRenumber(ctx, idParam(params), input),
});
