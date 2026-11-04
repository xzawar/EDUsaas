import { defineRoute } from '@/server/http/route';
import { getSchoolSettings, updateSchoolSettings, updateSettingsSchema } from '@/server/school/settings';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'settings.manage',
  handler: async (ctx) => getSchoolSettings(ctx),
});

export const PATCH = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'settings.manage',
  input: updateSettingsSchema,
  handler: async (ctx, { input }) => ({ settings: await updateSchoolSettings(ctx, input) }),
});
