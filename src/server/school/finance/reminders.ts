import 'server-only';
import { z } from 'zod';
import { formatPKR } from '@/lib/money';
import type { AuthedContext } from '@/server/http/route';
import { audit, inTenant } from '@/server/school/common';
import { defaulters } from '@/server/school/finance/reports';
import { notify } from '@/server/school/notifications';

/**
 * Fee reminders: a notification (and phone push) to each student whose bills are past due, with what they owe.
 * Everyone late, or just the students picked. Students who owe nothing are skipped.
 */
export const reminderSchema = z.object({ studentIds: z.array(z.string().uuid()).max(2000).optional() });

export async function sendFeeReminders(ctx: AuthedContext, input: z.infer<typeof reminderSchema>) {
  const late = await defaulters(ctx, { format: 'json' });
  const want = input.studentIds ? new Set(input.studentIds) : null;
  const rows = late.rows.filter((r) => !want || want.has(r.studentId));
  return inTenant(ctx, async (tx) => {
    const users = await tx.student.findMany({
      where: { id: { in: rows.map((r) => r.studentId) } },
      select: { id: true, userId: true },
    });
    const userOf = new Map(users.map((u) => [u.id, u.userId]));
    for (const r of rows) {
      const userId = userOf.get(r.studentId);
      if (!userId) continue;
      await notify(tx, ctx.tenantId!, [userId], {
        kind: 'fees',
        title: 'Fee reminder',
        body: `${formatPKR(r.balancePaisa)} is due on ${r.bills === 1 ? '1 bill' : `${r.bills} bills`}. Please pay at the office or send a proof in the app.`,
        link: '/student/fees',
      });
    }
    await audit(ctx, tx, {
      action: 'fees.remind',
      entity: 'Tenant',
      entityId: ctx.tenantId!,
      metadata: { students: rows.length, picked: input.studentIds?.length ?? null },
    });
    return { sent: rows.length };
  });
}
