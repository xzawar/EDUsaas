import { z } from 'zod';
import { defineRoute } from '@/server/http/route';
import { requestPasswordReset } from '@/server/auth/service';

const schema = z.object({ email: z.string().trim().email().max(200), portal: z.enum(['staff', 'platform']) });

/** Always the same response, whether or not the account exists (spec §3.5). */
export const POST = defineRoute({
  auth: 'public',
  input: schema,
  handler: async (meta, { input }) => {
    await requestPasswordReset({ email: input.email, portal: input.portal === 'staff' ? 'STAFF' : 'PLATFORM' }, meta);
    return { message: 'If an account with that email exists, a reset link has been sent.' };
  },
});
