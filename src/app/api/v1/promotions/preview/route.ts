import { defineRoute } from '@/server/http/route';
import { previewPromotion, promotionSchema } from '@/server/school/promotion';

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'promotion.run',
  input: promotionSchema,
  handler: async (ctx, { input }) => previewPromotion(ctx, input),
});
