import { defineRoute } from '@/server/http/route';
import { createTenant, createTenantSchema, listTenants, listTenantsQuery } from '@/server/platform/tenants';

export const GET = defineRoute({
  auth: 'user',
  portals: ['PLATFORM'],
  permission: 'platform.tenants.read',
  query: listTenantsQuery,
  handler: async (_ctx, { query }) => listTenants(query),
});

export const POST = defineRoute({
  auth: 'user',
  portals: ['PLATFORM'],
  permission: 'platform.tenants.manage',
  input: createTenantSchema,
  handler: async (ctx, { input }) => ({ status: 201, body: await createTenant(ctx, input) }),
});
