import 'server-only';
import { z } from 'zod';
import { formatPKR } from '@/lib/money';
import { STORAGE_MISSING, newKey, storage } from '@/server/files/storage';
import { AppError, notFound } from '@/server/http/errors';
import type { AuthedContext } from '@/server/http/route';
import { audit, friendlyDbError, inTenant, isoDate, schoolClock, sectionLabel, toDate } from '@/server/school/common';
import { invoiceTotals, yearRule } from '@/server/school/finance/invoices';
import { METHODS, recordPayment } from '@/server/school/finance/payments';
import { notify } from '@/server/school/notifications';
import { decodePhoto, photoSchema } from '@/server/school/photos';

/**
 * Payment claims (Finance spec §2.3): a parent paid by transfer and uploads the proof; the accountant confirms
 * (which records the payment and issues the receipt) or rejects with a note. The photo is private.
 */

const n = (v: bigint | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));

export const claimSchema = z.object({
  invoiceId: z.string().uuid(),
  amountPaisa: z.number().int().min(1).max(1_000_000_000_00),
  method: z.enum(METHODS.filter((m) => m !== 'CASH') as [string, ...string[]]),
  reference: z.string().trim().min(2).max(80),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  clientKey: z.string().uuid(),
  proof: photoSchema.shape.data,
});

export async function submitClaim(ctx: AuthedContext, input: z.infer<typeof claimSchema>) {
  const store = storage();
  if (!store) throw new AppError('CONFLICT', STORAGE_MISSING);
  const { buf, type, ext } = decodePhoto(input.proof);
  const key = `${newKey('finance', ctx.tenantId!, 'claims')}.${ext}`;
  try {
    const r = await inTenant(ctx, async (tx) => {
      const tenantId = ctx.tenantId!;
      const dupe = await tx.paymentClaim.findUnique({
        where: { tenantId_clientKey: { tenantId, clientKey: input.clientKey } },
      });
      if (dupe) return { id: dupe.id, status: dupe.status, duplicate: true, upload: false };
      const me = await tx.student.findUnique({
        where: { userId: ctx.user.id },
        select: { id: true, user: { select: { displayName: true } } },
      });
      if (!me) throw notFound('Student record');
      const invoice = await tx.invoice.findUnique({ where: { id: input.invoiceId } });
      if (!invoice || invoice.studentId !== me.id) throw notFound('Bill');
      if (invoice.status !== 'DUE' && invoice.status !== 'PARTIAL')
        throw new AppError('CONFLICT', 'This bill is not open for payment');
      const clock = await schoolClock(tx);
      if (input.paidOn > clock.today) throw new AppError('VALIDATION_FAILED', 'Paid date cannot be in the future');
      const rule = await yearRule(tx, invoice.academicYearId);
      const pending = await tx.paymentClaim.aggregate({
        where: { invoiceId: invoice.id, status: 'PENDING' },
        _sum: { amountPaisa: true },
      });
      const balance = invoiceTotals(invoice, rule, clock.today).balancePaisa - n(pending._sum.amountPaisa);
      if (input.amountPaisa > balance)
        throw new AppError(
          'VALIDATION_FAILED',
          `This bill only has ${formatPKR(balance)} left to pay (counting proofs already sent).`,
          {
            balancePaisa: balance,
          },
        );
      const claim = await tx.paymentClaim.create({
        data: {
          tenantId,
          studentId: me.id,
          invoiceId: invoice.id,
          amountPaisa: BigInt(input.amountPaisa),
          method: input.method as (typeof METHODS)[number],
          reference: input.reference,
          paidOn: toDate(input.paidOn),
          proofKey: key,
          clientKey: input.clientKey,
        },
      });
      await audit(ctx, tx, {
        action: 'claim.submit',
        entity: 'PaymentClaim',
        entityId: claim.id,
        after: { invoice: invoice.number, amountPaisa: input.amountPaisa, method: input.method },
      });
      const office = await tx.user.findMany({
        where: { role: { in: ['ACCOUNTANT', 'SCHOOL_ADMIN'] }, status: 'ACTIVE', deletedAt: null },
        select: { id: true },
      });
      await notify(
        tx,
        tenantId,
        office.map((u) => u.id),
        {
          kind: 'claim.submitted',
          title: 'Payment proof to check',
          body: `${me.user.displayName} says they paid bill ${invoice.number} by ${input.method}.`,
          link: '/staff/finance/claims',
        },
      );
      return { id: claim.id, status: claim.status, duplicate: false, upload: true };
    });
    if (r.upload) await store.put(key, buf, type);
    return { id: r.id, status: r.status, duplicate: r.duplicate };
  } catch (e) {
    friendlyDbError(e);
  }
}

export const listClaimsQuery = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'REJECTED', 'ALL']).default('PENDING'),
});

const claimInclude = {
  invoice: { select: { number: true, period: true } },
  student: {
    select: {
      id: true,
      rollNumber: true,
      user: { select: { displayName: true, username: true } },
      section: { include: { class: { select: { name: true } } } },
    },
  },
} as const;

function view(c: {
  id: string;
  amountPaisa: bigint;
  method: string;
  reference: string;
  paidOn: Date;
  status: string;
  decisionNote: string | null;
  paymentId: string | null;
  createdAt: Date;
  decidedAt: Date | null;
  proofKey: string | null;
  invoice: { number: string; period: string };
  student: {
    id: string;
    rollNumber: number | null;
    user: { displayName: string; username: string | null };
    section: { name: string; class: { name: string } } | null;
  };
}) {
  return {
    id: c.id,
    amountPaisa: n(c.amountPaisa),
    method: c.method,
    reference: c.reference,
    paidOn: isoDate(c.paidOn)!,
    status: c.status,
    decisionNote: c.decisionNote,
    paymentId: c.paymentId,
    createdAt: c.createdAt,
    decidedAt: c.decidedAt,
    hasProof: !!c.proofKey,
    invoice: c.invoice,
    student: {
      id: c.student.id,
      name: c.student.user.displayName,
      username: c.student.user.username,
      rollNumber: c.student.rollNumber,
      section: c.student.section ? sectionLabel(c.student.section) : null,
    },
  };
}

export async function listClaims(ctx: AuthedContext, q: z.infer<typeof listClaimsQuery>) {
  return inTenant(ctx, async (tx) => {
    const rows = await tx.paymentClaim.findMany({
      where: q.status === 'ALL' ? {} : { status: q.status },
      include: claimInclude,
      orderBy: q.status === 'PENDING' ? { createdAt: 'asc' } : { createdAt: 'desc' },
      take: 200,
    });
    const pending = await tx.paymentClaim.count({ where: { status: 'PENDING' } });
    return { items: rows.map(view), pending };
  });
}

export async function myClaims(ctx: AuthedContext) {
  return inTenant(ctx, async (tx) => {
    const rows = await tx.paymentClaim.findMany({
      where: { student: { userId: ctx.user.id } },
      include: claimInclude,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { items: rows.map(view) };
  });
}

/** The proof image: the office, or the student who sent it. */
export async function claimProof(ctx: AuthedContext, id: string) {
  const row = await inTenant(ctx, async (tx) => {
    const c = await tx.paymentClaim.findUnique({
      where: { id },
      select: { proofKey: true, student: { select: { userId: true } } },
    });
    if (!c) return null;
    if (ctx.user.role === 'STUDENT' && c.student.userId !== ctx.user.id) return null;
    return c;
  });
  if (!row?.proofKey) throw notFound('Proof');
  const file = await storage()?.get(row.proofKey);
  if (!file) throw notFound('Proof');
  return new Response(file.body as unknown as BodyInit, {
    headers: {
      'Content-Type': file.contentType,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    },
  });
}

export const decideSchema = z.object({
  decision: z.enum(['CONFIRM', 'REJECT']),
  note: z.string().trim().max(300).optional(),
  clientKey: z.string().uuid().optional(),
});

export async function decideClaim(ctx: AuthedContext, id: string, input: z.infer<typeof decideSchema>) {
  const claim = await inTenant(ctx, async (tx) => {
    const c = await tx.paymentClaim.findUnique({
      where: { id },
      include: { student: { select: { userId: true } }, invoice: { select: { number: true } } },
    });
    if (!c) throw notFound('Payment proof');
    if (c.status !== 'PENDING') throw new AppError('CONFLICT', 'This proof was already decided');
    return c;
  });
  if (input.decision === 'REJECT') {
    const note = input.note;
    if (!note) throw new AppError('VALIDATION_FAILED', 'Tell the parent why it was rejected');
    return inTenant(ctx, async (tx) => {
      await tx.paymentClaim.update({
        where: { id },
        data: { status: 'REJECTED', decidedBy: ctx.user.id, decidedAt: new Date(), decisionNote: note },
      });
      await audit(ctx, tx, {
        action: 'claim.reject',
        entity: 'PaymentClaim',
        entityId: id,
        after: { note },
      });
      await notify(tx, ctx.tenantId!, [claim.student.userId], {
        kind: 'claim.rejected',
        title: `Payment proof for ${claim.invoice.number} not accepted`,
        body: note,
        link: '/student/fees',
      });
      return { ok: true, status: 'REJECTED' as const };
    });
  }
  // CONFIRM: the payment carries the claim's own details; the claim's id keys idempotency.
  const r = await recordPayment(ctx, {
    studentId: claim.studentId,
    invoiceId: claim.invoiceId,
    amountPaisa: Number(claim.amountPaisa),
    method: claim.method,
    reference: claim.reference,
    receivedOn: isoDate(claim.paidOn)!,
    note: 'Confirmed from parent payment proof',
    clientKey: input.clientKey ?? claim.id,
    allowAdvance: true,
  });
  return inTenant(ctx, async (tx) => {
    await tx.paymentClaim.update({
      where: { id },
      data: {
        status: 'CONFIRMED',
        decidedBy: ctx.user.id,
        decidedAt: new Date(),
        decisionNote: input.note ?? null,
        paymentId: r.payment.id,
      },
    });
    await audit(ctx, tx, {
      action: 'claim.confirm',
      entity: 'PaymentClaim',
      entityId: id,
      after: { receiptNumber: r.payment.receiptNumber },
    });
    await notify(tx, ctx.tenantId!, [claim.student.userId], {
      kind: 'claim.confirmed',
      title: `Payment confirmed: ${r.payment.receiptNumber}`,
      body: `Your payment for bill ${claim.invoice.number} is confirmed. Receipt ${r.payment.receiptNumber}.`,
      link: '/student/fees',
    });
    return { ok: true, status: 'CONFIRMED' as const, payment: r.payment };
  });
}
