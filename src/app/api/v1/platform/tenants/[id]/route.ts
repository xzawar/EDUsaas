import { z } from 'zod';
import { defineRoute, uuidParam } from '@/server/http/route';
import { AppError } from '@/server/http/errors';
import { setTenantStatus } from '@/server/platform/tenants';

const schema = z.object({ status: z.enum(['TRIAL', 'ACTIVE', 'SUSPENDED']) }).strict();

export const PATCH = defineRoute({
  auth: 'user',
  portals: ['PLATFORM'],
  permission: 'platform.tenants.manage',
  input: schema,
  handler: async (ctx, { input, params }) => {
    const id = uuidParam.safeParse(params.id);
    if (!id.success) throw new AppError('NOT_FOUND', 'School not found');
    return { tenant: await setTenantStatus(ctx, id.data, input.status) };
  },
});
