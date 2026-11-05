import { defineRoute, idParam } from '@/server/http/route';
import {
  endSupportByPlatform,
  requestSupport,
  requestSupportSchema,
  tenantSupportSummary,
} from '@/server/platform/support';

export const GET = defineRoute({
  auth: 'user',
  portals: ['PLATFORM'],
  permission: 'platform.tenants.manage',
  handler: async (_ctx, { params }) => tenantSupportSummary(idParam(params)),
});

/** Ask the school for time-boxed, read-only access. The School Admin decides. */
export const POST = defineRoute({
  auth: 'user',
  portals: ['PLATFORM'],
  permission: 'platform.tenants.manage',
  input: requestSupportSchema,
  handler: async (ctx, { input, params }) => ({
    status: 201,
    body: { grant: await requestSupport(ctx, idParam(params), input) },
  }),
});

/** Withdraw a pending request or end active access early. */
export const DELETE = defineRoute({
  auth: 'user',
  portals: ['PLATFORM'],
  permission: 'platform.tenants.manage',
  handler: async (ctx, { params }) => endSupportByPlatform(ctx, idParam(params)),
});
