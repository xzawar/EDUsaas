import { forbidden } from '@/server/http/errors';
import { defineRoute, idParam, type AuthedContext } from '@/server/http/route';
import {
  canUseSupportAccess,
  endSupportByPlatform,
  requestSupport,
  requestSupportSchema,
  tenantSupportSummary,
} from '@/server/platform/support';

/** The Platform Owner, or a Platform Admin the Owner granted support access to. */
const guard = (ctx: AuthedContext) => {
  if (!canUseSupportAccess(ctx)) throw forbidden('You do not have permission to do this');
};

export const GET = defineRoute({
  auth: 'user',
  portals: ['PLATFORM'],
  handler: async (ctx, { params }) => {
    guard(ctx);
    return tenantSupportSummary(idParam(params));
  },
});

/** Ask the school for time-boxed, read-only access (a Platform Admin's request goes to the Owner first). */
export const POST = defineRoute({
  auth: 'user',
  portals: ['PLATFORM'],
  input: requestSupportSchema,
  handler: async (ctx, { input, params }) => {
    guard(ctx);
    return { status: 201, body: { grant: await requestSupport(ctx, idParam(params), input) } };
  },
});

/** Withdraw a pending request or end active access early. */
export const DELETE = defineRoute({
  auth: 'user',
  portals: ['PLATFORM'],
  handler: async (ctx, { params }) => {
    guard(ctx);
    return endSupportByPlatform(ctx, idParam(params));
  },
});
