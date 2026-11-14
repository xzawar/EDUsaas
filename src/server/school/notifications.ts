import 'server-only';
import type { TenantTx } from '@/server/db/client';
import type { AuthedContext } from '@/server/http/route';
import { inTenant } from '@/server/school/common';
import { sendPush } from '@/server/auth/push';

/**
 * In-app notifications (spec §1.3). Written inside the caller's tenant transaction so they commit with the
 * change that caused them. Email/SMS are deferred; a channel interface can fan out from here later.
 */
export async function notify(
  tx: TenantTx,
  tenantId: string,
  userIds: string[],
  n: { kind: string; title: string; body: string; link?: string },
) {
  const ids = [...new Set(userIds)];
  if (!ids.length) return;
  await tx.notification.createMany({
    data: ids.map((userId) => ({
      tenantId,
      userId,
      kind: n.kind,
      title: n.title,
      body: n.body.slice(0, 500),
      link: n.link ?? null,
    })),
  });
  // Native app: best-effort push for the same message (never blocks or fails the caller).
  void sendPush(ids, { title: n.title, body: n.body, link: n.link });
}

export async function myNotifications(ctx: AuthedContext, limit = 20) {
  if (!ctx.tenantId) return { items: [], unread: 0 };
  return inTenant(ctx, async (tx) => {
    const [items, unread] = await Promise.all([
      tx.notification.findMany({ where: { userId: ctx.user.id }, orderBy: { createdAt: 'desc' }, take: limit }),
      tx.notification.count({ where: { userId: ctx.user.id, readAt: null } }),
    ]);
    return { items, unread };
  });
}

export async function markNotificationsRead(ctx: AuthedContext, ids?: string[]) {
  return inTenant(ctx, async (tx) => {
    const r = await tx.notification.updateMany({
      where: { userId: ctx.user.id, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
    return { marked: r.count };
  });
}
