import { defineRoute, idParam } from '@/server/http/route';
import { photoResponse, photoSchema, removePhoto, setPhoto } from '@/server/school/photos';

/** Viewable by anyone who can open the student (teachers: own sections). */
export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'students.search',
  handler: async (ctx, { params }) => photoResponse(ctx, { kind: 'student', id: idParam(params) }),
});

export const PUT = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'students.write',
  maxBodyBytes: 500_000,
  input: photoSchema,
  handler: async (ctx, { input, params }) => setPhoto(ctx, { kind: 'student', id: idParam(params) }, input),
});

export const DELETE = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'students.write',
  handler: async (ctx, { params }) => removePhoto(ctx, { kind: 'student', id: idParam(params) }),
});
