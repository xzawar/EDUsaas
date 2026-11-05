import { defineRoute } from '@/server/http/route';
import { previewImport, previewSchema } from '@/server/school/imports';

/** Upload (base64 JSON, ≤ 2 MB file) → validated preview. Nothing is created until commit. */
export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'students.import',
  maxBodyBytes: 3_200_000,
  input: previewSchema,
  handler: async (ctx, { input }) => ({ status: 201, body: { import: await previewImport(ctx, input) } }),
});
