import 'server-only';
import { z } from 'zod';
import { AppError, notFound } from '@/server/http/errors';
import type { AuthedContext } from '@/server/http/route';
import { audit, inTenant } from '@/server/school/common';

/** The school's side of break-glass support: see every request, approve/deny, end access early. */

export async function listSupportGrants(ctx: AuthedContext) {
  return inTenant(ctx, async (tx) => {
    await tx.supportGrant.updateMany({
      where: { status: 'ACTIVE', expiresAt: { lte: new Date() } },
      data: { status: 'EXPIRED', endedAt: new Date() },
    });
    return tx.supportGrant.findMany({ orderBy: { createdAt: 'desc' }, take: 20 });
  });
}

export const supportDecisionSchema = z.object({ decision: z.enum(['APPROVE', 'DENY', 'END']) });

export async function decideSupport(ctx: AuthedContext, id: string, input: z.infer<typeof supportDecisionSchema>) {
  return inTenant(ctx, async (tx) => {
    const g = await tx.supportGrant.findUnique({ where: { id } });
    if (!g) throw notFound('Support request');
    const now = new Date();
    if (input.decision === 'END') {
      if (g.status !== 'ACTIVE' || (g.expiresAt && g.expiresAt <= now))
        throw new AppError('CONFLICT', 'This access isn’t active');
      await tx.supportGrant.update({
        where: { id },
        data: { status: 'REVOKED', endedAt: now, decidedBy: g.decidedBy ?? ctx.user.id },
      });
    } else {
      if (g.status !== 'PENDING') throw new AppError('CONFLICT', 'This request has already been decided');
      await tx.supportGrant.update({
        where: { id },
        data:
          input.decision === 'APPROVE'
            ? {
                status: 'ACTIVE',
                decidedBy: ctx.user.id,
                decidedAt: now,
                expiresAt: new Date(now.getTime() + g.durationMinutes * 60_000),
              }
            : { status: 'DENIED', decidedBy: ctx.user.id, decidedAt: now, endedAt: now },
      });
    }
    await audit(ctx, tx, {
      action:
        input.decision === 'APPROVE' ? 'support.grant' : input.decision === 'DENY' ? 'support.deny' : 'support.revoke',
      entity: 'SupportGrant',
      entityId: id,
      metadata: { requester: g.requesterName, minutes: g.durationMinutes },
    });
    return { ok: true };
  });
}
