import { z } from 'zod';
import { defineRoute } from '@/server/http/route';
import { resetPassword } from '@/server/auth/service';
import { newPasswordSchema } from '@/server/auth/password';

const schema = z.object({ token: z.string().min(20).max(200), newPassword: newPasswordSchema });

export const POST = defineRoute({
  auth: 'public',
  input: schema,
  handler: async (meta, { input }) => {
    await resetPassword(input, meta);
    return { message: 'Your password has been reset. You can now sign in.' };
  },
});
