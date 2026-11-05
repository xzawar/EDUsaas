import { defineRoute, idParam } from '@/server/http/route';
import { updateLeaveType, updateLeaveTypeSchema } from '@/server/school/leave';

/** Who can use a leave type, or retire it (kept for past requests). */
export const PATCH = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'settings.manage',
  input: updateLeaveTypeSchema,
  handler: async (ctx, { input, params }) => ({ type: await updateLeaveType(ctx, idParam(params), input) }),
});
