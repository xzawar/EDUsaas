import { defineRoute, uuidParam } from '@/server/http/route';
import { AppError } from '@/server/http/errors';
import { getSchoolUser } from '@/server/school/users';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'users.read',
  handler: async (ctx, { params }) => {
    const id = uuidParam.safeParse(params.id);
    if (!id.success) throw new AppError('NOT_FOUND', 'User not found');
    return { user: await getSchoolUser(ctx, id.data) };
  },
});
