import 'server-only';
import { z } from 'zod';
import { systemDb } from '@/server/db/system';
import type { AuthedContext } from '@/server/http/route';

/**
 * Push notifications for the native app (spec §3.6). Tokens are Expo push tokens, one per device; the app registers
 * on sign-in and the server fans out the same notifications the bell shows. Sending is best-effort: a failed push
 * never fails the action that caused it, and the in-app list remains the source of truth.
 */

export const pushTokenSchema = z.object({
  token: z.string().regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,}\]$/, 'Not an Expo push token'),
  platform: z.enum(['android', 'ios']).default('android'),
  appVersion: z.string().max(40).optional(),
});

export async function registerPushToken(ctx: AuthedContext, input: z.infer<typeof pushTokenSchema>) {
  await systemDb().pushToken.upsert({
    where: { token: input.token },
    create: { userId: ctx.user.id, token: input.token, platform: input.platform, appVersion: input.appVersion },
    update: { userId: ctx.user.id, platform: input.platform, appVersion: input.appVersion },
  });
  return { ok: true };
}

export async function removePushToken(ctx: AuthedContext, token: string) {
  await systemDb().pushToken.deleteMany({ where: { token, userId: ctx.user.id } });
  return { ok: true };
}

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';

/** Sends one push per device for these users. Fire-and-forget safe; invalid tokens are removed. */
export async function sendPush(userIds: string[], n: { title: string; body: string; link?: string }) {
  if (!userIds.length) return 0;
  const tokens = await systemDb().pushToken.findMany({ where: { userId: { in: userIds } }, select: { token: true } });
  if (!tokens.length) return 0;
  const messages = tokens.map((t) => ({
    to: t.token,
    title: n.title,
    body: n.body.slice(0, 180),
    data: { link: n.link ?? null },
    sound: 'default',
    channelId: 'default',
  }));
  try {
    const res = await fetch(EXPO_PUSH, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(4000),
    });
    const json = (await res.json().catch(() => null)) as {
      data?: { status: string; details?: { error?: string } }[];
    } | null;
    const dead = (json?.data ?? [])
      .map((r, i) => (r.status === 'error' && r.details?.error === 'DeviceNotRegistered' ? tokens[i]!.token : null))
      .filter((t): t is string => !!t);
    if (dead.length) await systemDb().pushToken.deleteMany({ where: { token: { in: dead } } });
    return messages.length - dead.length;
  } catch {
    return 0;
  }
}
