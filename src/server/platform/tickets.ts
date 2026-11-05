import 'server-only';
import { z } from 'zod';
import { recordAudit } from '@/server/audit/audit';
import { systemDb } from '@/server/db/system';
import { AppError, notFound } from '@/server/http/errors';
import type { AuthedContext } from '@/server/http/route';

/** Platform side of support tickets: the queue (spec §2.8). Tickets show only what the school wrote — no school data. */

export const ticketQuery = z.object({ status: z.enum(['OPEN', 'ANSWERED', 'CLOSED', 'ALL']).default('OPEN') });

export async function ticketQueue(q: z.infer<typeof ticketQuery>) {
  const rows = await systemDb().supportTicket.findMany({
    where: q.status === 'ALL' ? {} : { status: q.status },
    orderBy: { updatedAt: q.status === 'OPEN' ? 'asc' : 'desc' },
    take: 100,
    include: { tenant: { select: { id: true, name: true, prefix: true } }, author: { select: { displayName: true, role: true } }, _count: { select: { messages: true } } },
  });
  const counts = await systemDb().supportTicket.groupBy({ by: ['status'], _count: true });
  return {
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
    items: rows.map((t) => ({ id: t.id, subject: t.subject, status: t.status, school: t.tenant, author: t.author.displayName, authorRole: t.author.role, messages: t._count.messages, createdAt: t.createdAt, updatedAt: t.updatedAt })),
  };
}

export async function ticketDetail(id: string) {
  const t = await systemDb().supportTicket.findUnique({
    where: { id },
    include: { tenant: { select: { id: true, name: true, prefix: true } }, author: { select: { displayName: true } }, messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!t) throw notFound('Ticket');
  return {
    id: t.id,
    subject: t.subject,
    status: t.status,
    school: t.tenant,
    author: t.author.displayName,
    createdAt: t.createdAt,
    messages: t.messages.map((m) => ({ id: m.id, body: m.body, author: m.authorName, fromPlatform: m.fromPlatform, createdAt: m.createdAt })),
  };
}

export const platformReplySchema = z.object({ body: z.string().trim().min(1).max(5000), close: z.boolean().default(false) });

export async function replyAsPlatform(ctx: AuthedContext, id: string, input: z.infer<typeof platformReplySchema>) {
  const db = systemDb();
  const t = await db.supportTicket.findUnique({ where: { id } });
  if (!t) throw notFound('Ticket');
  if (t.status === 'CLOSED' && !input.close) throw new AppError('CONFLICT', 'This ticket is closed');
  await db.$transaction([
    db.ticketMessage.create({ data: { tenantId: t.tenantId, ticketId: id, authorId: ctx.user.id, authorName: `${ctx.user.displayName} (EDUsaas)`, fromPlatform: true, body: input.body } }),
    db.supportTicket.update({ where: { id }, data: { status: input.close ? 'CLOSED' : 'ANSWERED' } }),
    db.notification.create({
      data: { tenantId: t.tenantId, userId: t.createdBy, kind: 'support', title: 'EDUsaas support replied', body: t.subject, link: '/staff/support' },
    }),
  ]);
  await recordAudit({ tenantId: t.tenantId, actorId: ctx.user.id, actorRole: ctx.user.role, action: 'ticket.reply', entity: 'SupportTicket', entityId: id, metadata: { closed: input.close }, requestId: ctx.requestId });
  return { ok: true };
}
