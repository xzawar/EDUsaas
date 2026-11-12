import 'server-only';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { TenantTx } from '@/server/db/client';
import { AppError, notFound } from '@/server/http/errors';
import type { AuthedContext } from '@/server/http/route';
import { audit, friendlyDbError, inTenant, isoDate, schoolClock, toDate } from '@/server/school/common';
import { invoiceTotals, recomputeInvoice, yearRule } from '@/server/school/finance/invoices';
import { postLedger } from '@/server/school/finance/ledger';
import { nextNumber } from '@/server/school/finance/sequences';
import { formatPKR } from '@/lib/money';
import { notify } from '@/server/school/notifications';

/**
 * Payments (Finance spec §2.3). A payment is money received; allocations spread it over invoices and the
 * unallocated remainder is the student's advance. Payments are never deleted: a mistake is reversed with a mirror
 * row, and both stay visible. Receipt numbers are gap-free per school.
 */

const n = (v: bigint | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));
export const METHODS = ['CASH', 'BANK', 'JAZZCASH', 'EASYPAISA', 'CHEQUE'] as const;
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const paymentSchema = z.object({
  studentId: z.string().uuid(),
  invoiceId: z.string().uuid().optional(),
  amountPaisa: z.number().int().min(1).max(1_000_000_000_00),
  method: z.enum(METHODS),
  reference: z.string().trim().max(80).optional(),
  receivedOn: dateStr,
  note: z.string().trim().max(300).optional(),
  /** Idempotency key from the client/offline queue. */
  clientKey: z.string().uuid(),
  /** Money beyond the invoice balance is kept on account for the next bill. */
  allowAdvance: z.boolean().default(false),
});

/** Allocates `amount` of a payment to an invoice and recomputes it. */
async function allocate(
  tx: TenantTx,
  tenantId: string,
  paymentId: string,
  invoiceId: string,
  amount: number,
  today: string,
) {
  if (amount <= 0) return;
  await tx.paymentAllocation.create({ data: { tenantId, paymentId, invoiceId, amountPaisa: BigInt(amount) } });
  await recomputeInvoice(tx, invoiceId, today);
}

/** Unallocated money of a payment. */
async function unallocated(tx: TenantTx, paymentId: string) {
  const [p, sum] = await Promise.all([
    tx.payment.findUniqueOrThrow({
      where: { id: paymentId },
      select: { amountPaisa: true, reversedByPaymentId: true },
    }),
    tx.paymentAllocation.aggregate({ where: { paymentId }, _sum: { amountPaisa: true } }),
  ]);
  if (p.reversedByPaymentId) return 0;
  return n(p.amountPaisa) - n(sum._sum.amountPaisa);
}

/**
 * Applies a student's advance (unallocated, unreversed payments) to their open invoices, oldest first. Called after
 * invoices are generated and after an advance is recorded. No ledger entry: the money was counted when received.
 */
export async function applyAdvances(tx: TenantTx, tenantId: string, studentId: string, today: string) {
  const payments = await tx.payment.findMany({
    where: { studentId, reversedByPaymentId: null, reversesPaymentId: null, amountPaisa: { gt: 0 } },
    orderBy: [{ receivedOn: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  });
  let applied = 0;
  for (const p of payments) {
    let free = await unallocated(tx, p.id);
    if (free <= 0) continue;
    const open = await tx.invoice.findMany({
      where: { studentId, status: { in: ['DUE', 'PARTIAL'] } },
      orderBy: [{ dueOn: 'asc' }, { number: 'asc' }],
    });
    for (const inv of open) {
      if (free <= 0) break;
      const rule = await yearRule(tx, inv.academicYearId);
      const balance = invoiceTotals(inv, rule, today).balancePaisa;
      if (balance <= 0) continue;
      const amount = Math.min(free, balance);
      await allocate(tx, tenantId, p.id, inv.id, amount, today);
      free -= amount;
      applied += amount;
    }
  }
  return applied;
}

function receiptView(p: Prisma.PaymentGetPayload<{ include: { allocations: true } }>) {
  return {
    id: p.id,
    receiptNumber: p.receiptNumber,
    amountPaisa: n(p.amountPaisa),
    method: p.method,
    reference: p.reference,
    receivedOn: isoDate(p.receivedOn)!,
    invoiceId: p.invoiceId,
    allocatedPaisa: p.allocations.reduce((a, x) => a + n(x.amountPaisa), 0),
    reversed: !!p.reversedByPaymentId,
  };
}

export async function recordPayment(ctx: AuthedContext, input: z.infer<typeof paymentSchema>) {
  try {
    return await inTenant(ctx, async (tx) => {
      const tenantId = ctx.tenantId!;
      const dupe = await tx.payment.findUnique({
        where: { tenantId_clientKey: { tenantId, clientKey: input.clientKey } },
        include: { allocations: true },
      });
      if (dupe) return { payment: receiptView(dupe), duplicate: true };

      const clock = await schoolClock(tx);
      if (input.receivedOn > clock.today)
        throw new AppError('VALIDATION_FAILED', 'Received date cannot be in the future');
      const student = await tx.student.findUnique({
        where: { id: input.studentId },
        select: { id: true, userId: true, user: { select: { displayName: true } } },
      });
      if (!student) {
        await audit(ctx, tx, {
          action: 'access.not_found',
          entity: 'Student',
          entityId: input.studentId,
          outcome: 'denied',
        });
        throw notFound('Student');
      }

      let toInvoice = 0;
      let invoice: Prisma.InvoiceGetPayload<object> | null = null;
      if (input.invoiceId) {
        invoice = await tx.invoice.findUnique({ where: { id: input.invoiceId } });
        if (!invoice || invoice.studentId !== student.id) throw notFound('Invoice');
        if (invoice.status === 'VOID') throw new AppError('CONFLICT', 'This bill is cancelled');
        if (invoice.status === 'WAIVED') throw new AppError('CONFLICT', 'This bill was waived');
        if (invoice.status === 'PAID') throw new AppError('CONFLICT', 'This bill is already paid in full');
        const rule = await yearRule(tx, invoice.academicYearId);
        const balance = invoiceTotals(invoice, rule, clock.today).balancePaisa;
        if (input.amountPaisa > balance && !input.allowAdvance)
          throw new AppError(
            'VALIDATION_FAILED',
            `This bill only has ${formatPKR(balance)} left to pay. Tick “keep extra as advance” to accept more.`,
            {
              balancePaisa: balance,
            },
          );
        toInvoice = Math.min(input.amountPaisa, balance);
      }

      const payment = await tx.payment.create({
        data: {
          tenantId,
          studentId: student.id,
          invoiceId: invoice?.id ?? null,
          amountPaisa: BigInt(input.amountPaisa),
          method: input.method,
          reference: input.reference || null,
          receivedOn: toDate(input.receivedOn),
          receivedBy: ctx.user.id,
          receiptNumber: await nextNumber(tx, tenantId, 'RECEIPT'),
          note: input.note || null,
          clientKey: input.clientKey,
        },
      });
      if (invoice) await allocate(tx, tenantId, payment.id, invoice.id, toInvoice, clock.today);
      await postLedger(tx, {
        tenantId,
        entryOn: input.receivedOn,
        kind: invoice ? 'FEE' : 'ADVANCE',
        direction: 'IN',
        amountPaisa: input.amountPaisa,
        method: input.method,
        refTable: 'payments',
        refId: payment.id,
        studentId: student.id,
        createdBy: ctx.user.id,
      });
      // Anything left over goes to other open bills, oldest first.
      if (input.amountPaisa > toInvoice) await applyAdvances(tx, tenantId, student.id, clock.today);
      await audit(ctx, tx, {
        action: 'payment.record',
        entity: 'Payment',
        entityId: payment.id,
        after: {
          receiptNumber: payment.receiptNumber,
          studentId: student.id,
          invoiceId: invoice?.id ?? null,
          amountPaisa: input.amountPaisa,
          method: input.method,
        },
      });
      await notify(tx, tenantId, [student.userId], {
        kind: 'fee.payment',
        title: `Payment received: ${payment.receiptNumber}`,
        body: `Thank you. We received your payment${invoice ? ` for ${invoice.period}` : ''}.`,
        link: '/student/fees',
      });
      const full = await tx.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { allocations: true } });
      return { payment: receiptView(full), duplicate: false };
    });
  } catch (e) {
    friendlyDbError(e);
  }
}

export const reverseSchema = z.object({ reason: z.string().trim().min(3).max(200) });

/** Undo a payment: mirror row, allocations removed, invoices recomputed, ledger counter-entry. */
export async function reversePayment(ctx: AuthedContext, id: string, input: z.infer<typeof reverseSchema>) {
  return inTenant(ctx, async (tx) => {
    const tenantId = ctx.tenantId!;
    const p = await tx.payment.findUnique({ where: { id }, include: { allocations: true } });
    if (!p) throw notFound('Payment');
    if (p.reversesPaymentId) throw new AppError('CONFLICT', 'A reversal cannot be reversed');
    if (p.reversedByPaymentId) throw new AppError('CONFLICT', 'This payment was already reversed');
    const clock = await schoolClock(tx);
    const reversal = await tx.payment.create({
      data: {
        tenantId,
        studentId: p.studentId,
        invoiceId: p.invoiceId,
        amountPaisa: -p.amountPaisa,
        method: p.method,
        reference: p.reference,
        receivedOn: toDate(clock.today),
        receivedBy: ctx.user.id,
        receiptNumber: await nextNumber(tx, tenantId, 'RECEIPT'),
        reversesPaymentId: p.id,
        reversalReason: input.reason,
      },
    });
    await tx.payment.update({ where: { id: p.id }, data: { reversedByPaymentId: reversal.id } });
    const invoiceIds = [...new Set(p.allocations.map((a) => a.invoiceId))];
    await tx.paymentAllocation.deleteMany({ where: { paymentId: p.id } });
    for (const invoiceId of invoiceIds) await recomputeInvoice(tx, invoiceId, clock.today);
    await postLedger(tx, {
      tenantId,
      entryOn: clock.today,
      kind: 'REVERSAL',
      direction: 'OUT',
      amountPaisa: p.amountPaisa,
      method: p.method,
      refTable: 'payments',
      refId: reversal.id,
      studentId: p.studentId,
      createdBy: ctx.user.id,
    });
    await audit(ctx, tx, {
      action: 'payment.reverse',
      entity: 'Payment',
      entityId: p.id,
      before: { receiptNumber: p.receiptNumber, amountPaisa: n(p.amountPaisa) },
      after: { reason: input.reason, reversalReceipt: reversal.receiptNumber },
    });
    return { reversal: { id: reversal.id, receiptNumber: reversal.receiptNumber } };
  });
}

/** A payment with everything the receipt shows. Students may load their own; staff need fees.collect/finance.read. */
export async function paymentForReceipt(ctx: AuthedContext, id: string) {
  const r = await inTenant(ctx, async (tx) => {
    const p = await tx.payment.findUnique({
      where: { id },
      include: {
        allocations: { include: { invoice: { select: { number: true, period: true } } } },
        student: {
          select: {
            rollNumber: true,
            userId: true,
            guardianName: true,
            user: { select: { displayName: true, username: true } },
            section: { include: { class: { select: { name: true } } } },
          },
        },
      },
    });
    if (!p) return null;
    if (ctx.user.role === 'STUDENT' && p.student.userId !== ctx.user.id) return null;
    const [tenant, settings, receivedBy] = await Promise.all([
      tx.tenant.findFirstOrThrow({ select: { name: true, city: true } }),
      tx.tenantSettings.findFirstOrThrow({ select: { receiptFooter: true } }),
      tx.user.findUnique({ where: { id: p.receivedBy }, select: { displayName: true } }),
    ]);
    return { payment: p, tenant, settings, receivedBy: receivedBy?.displayName ?? 'School office' };
  });
  if (!r) throw notFound('Receipt');
  return r;
}
