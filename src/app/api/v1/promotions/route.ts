import { defineRoute } from '@/server/http/route';
import { listPromotionJobs, promotionSchema, runPromotion } from '@/server/school/promotion';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'promotion.run',
  handler: async (ctx) => ({ items: await listPromotionJobs(ctx) }),
});

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'promotion.run',
  input: promotionSchema,
  handler: async (ctx, { input }) => ({ status: 201, body: await runPromotion(ctx, input) }),
});
