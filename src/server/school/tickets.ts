import 'server-only';
import { z } from 'zod';
import { AppError, forbidden, notFound } from '@/server/http/errors';
import type { AuthedContext } from '@/server/http/route';
import { audit, inTenant } from '@/server/school/common';

/** School side of support tickets (spec §2.8, §9.6 step 1): the School Admin or Principal asks EDUsaas for help. */

export function canUseSupport(ctx: AuthedContext) {
  return ctx.user.role === 'SCHOOL_ADMIN' || ctx.user.role === 'PRINCIPAL';
}
function guard(ctx: AuthedContext) {
  if (!canUseSupport(ctx)) throw forbidden('Only the School Admin or Principal can contact EDUsaas support');
}

export const newTicketSchema = z.object({
  subject: z.string().trim().min(3, 'Add a short subject').max(150),
  body: z.string().trim().min(1, 'Describe the problem').max(5000),
});
export const replySchema = z.object({ body: z.string().trim().min(1).max(5000) });

export async function myTickets(ctx: AuthedContext) {
  guard(ctx);
  return inTenant(ctx, async (tx) => {
    const rows = await tx.supportTicket.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: { messages: { orderBy: { createdAt: 'asc' } }, author: { select: { displayName: true } } },
    });
    return rows.map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      author: t.author.displayName,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      messages: t.messages.map((m) => ({
        id: m.id,
        body: m.body,
        author: m.authorName,
        fromPlatform: m.fromPlatform,
        createdAt: m.createdAt,
      })),
    }));
  });
}

export async function openTicket(ctx: AuthedContext, input: z.infer<typeof newTicketSchema>) {
  guard(ctx);
  return inTenant(ctx, async (tx) => {
    const t = await tx.supportTicket.create({
      data: { tenantId: ctx.tenantId!, createdBy: ctx.user.id, subject: input.subject },
    });
    await tx.ticketMessage.create({
      data: {
        tenantId: ctx.tenantId!,
        ticketId: t.id,
        authorId: ctx.user.id,
        authorName: ctx.user.displayName,
        body: input.body,
      },
    });
    await audit(ctx, tx, {
      action: 'ticket.open',
      entity: 'SupportTicket',
      entityId: t.id,
      metadata: { subject: input.subject },
    });
    return { id: t.id };
  });
}

export async function replyToTicket(ctx: AuthedContext, id: string, input: z.infer<typeof replySchema>) {
  guard(ctx);
  return inTenant(ctx, async (tx) => {
    const t = await tx.supportTicket.findUnique({ where: { id } });
    if (!t) throw notFound('Ticket');
    if (t.status === 'CLOSED') throw new AppError('CONFLICT', 'This ticket is closed. Open a new one.');
    await tx.ticketMessage.create({
      data: {
        tenantId: ctx.tenantId!,
        ticketId: id,
        authorId: ctx.user.id,
        authorName: ctx.user.displayName,
        body: input.body,
      },
    });
    await tx.supportTicket.update({ where: { id }, data: { status: 'OPEN' } });
    return { ok: true };
  });
}

export async function closeMyTicket(ctx: AuthedContext, id: string) {
  guard(ctx);
  return inTenant(ctx, async (tx) => {
    const t = await tx.supportTicket.findUnique({ where: { id } });
    if (!t) throw notFound('Ticket');
    await tx.supportTicket.update({ where: { id }, data: { status: 'CLOSED' } });
    await audit(ctx, tx, { action: 'ticket.close', entity: 'SupportTicket', entityId: id });
    return { ok: true };
  });
}
