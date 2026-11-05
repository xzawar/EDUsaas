import { defineRoute, idParam } from '@/server/http/route';
import { photoResponse, photoSchema, removePhoto, setPhoto } from '@/server/school/photos';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  handler: async (ctx, { params }) => photoResponse(ctx, { kind: 'teacher', id: idParam(params) }),
});

export const PUT = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'teachers.write',
  maxBodyBytes: 500_000,
  input: photoSchema,
  handler: async (ctx, { input, params }) => setPhoto(ctx, { kind: 'teacher', id: idParam(params) }, input),
});

export const DELETE = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'teachers.write',
  handler: async (ctx, { params }) => removePhoto(ctx, { kind: 'teacher', id: idParam(params) }),
});
