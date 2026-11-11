import 'server-only';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { TenantTx } from '@/server/db/client';
import { STORAGE_MISSING, newKey, storage } from '@/server/files/storage';
import { AppError, notFound } from '@/server/http/errors';
import type { AuthedContext } from '@/server/http/route';
import { audit, friendlyDbError, inTenant, isoDate, schoolClock, toDate } from '@/server/school/common';
import { postLedger } from '@/server/school/finance/ledger';
import { METHODS } from '@/server/school/finance/payments';
import { nextNumber } from '@/server/school/finance/sequences';
import { decodePhoto, photoSchema } from '@/server/school/photos';

/**
 * Expenses and petty cash (Finance spec §2.2). Every expense gets a voucher number and an OUT ledger entry; expenses
 * are never deleted, only reversed. The "Salaries" category is created by payroll and cannot be archived.
 */

const n = (v: bigint | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));
export const SALARIES_CATEGORY = 'Salaries';

export const categorySchema = z.object({ name: z.string().trim().min(2).max(60) });
export const updateCategorySchema = z
  .object({ name: z.string().trim().min(2).max(60).optional(), archived: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');

export async function listCategories(ctx: AuthedContext, includeArchived = false) {
  return inTenant(ctx, (tx) =>
    tx.expenseCategory.findMany({
      where: includeArchived ? {} : { archivedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, system: true, archivedAt: true },
    }),
  );
}

export async function createCategory(ctx: AuthedContext, input: z.infer<typeof categorySchema>) {
  try {
    return await inTenant(ctx, async (tx) => {
      const clash = await tx.expenseCategory.findFirst({
        where: { name: { equals: input.name, mode: 'insensitive' } },
      });
      if (clash) throw new AppError('CONFLICT', 'A category with that name already exists', { field: 'name' });
      const c = await tx.expenseCategory.create({ data: { tenantId: ctx.tenantId!, name: input.name } });
      await audit(ctx, tx, {
        action: 'expense_category.create',
        entity: 'ExpenseCategory',
        entityId: c.id,
        after: input,
      });
      return c;
    });
  } catch (e) {
    friendlyDbError(e, { name: 'A category with that name already exists' });
  }
}

export async function updateCategory(ctx: AuthedContext, id: string, input: z.infer<typeof updateCategorySchema>) {
  try {
    return await inTenant(ctx, async (tx) => {
      const before = await tx.expenseCategory.findUnique({ where: { id } });
      if (!before) throw notFound('Category');
      if (before.system && input.archived)
        throw new AppError('CONFLICT', 'This category is used by payroll and cannot be archived');
      const c = await tx.expenseCategory.update({
        where: { id },
        data: {
          name: input.name,
          archivedAt: input.archived === undefined ? undefined : input.archived ? new Date() : null,
        },
      });
      await audit(ctx, tx, {
        action: 'expense_category.update',
        entity: 'ExpenseCategory',
        entityId: id,
        before: { name: before.name, archived: !!before.archivedAt },
        after: { name: c.name, archived: !!c.archivedAt },
      });
      return c;
    });
  } catch (e) {
    friendlyDbError(e, { name: 'A category with that name already exists' });
  }
}

/** Finds or creates the system "Salaries" category (used by payroll). */
export async function salariesCategory(tx: TenantTx, tenantId: string) {
  const existing = await tx.expenseCategory.findFirst({
    where: { name: { equals: SALARIES_CATEGORY, mode: 'insensitive' } },
  });
  if (existing) {
    if (!existing.system)
      await tx.expenseCategory.update({ where: { id: existing.id }, data: { system: true, archivedAt: null } });
    return existing.id;
  }
  return (await tx.expenseCategory.create({ data: { tenantId, name: SALARIES_CATEGORY, system: true } })).id;
}

export const expenseSchema = z.object({
  categoryId: z.string().uuid(),
  amountPaisa: z.number().int().min(1).max(1_000_000_000_00),
  spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paidTo: z.string().trim().min(2).max(120),
  method: z.enum(METHODS),
  reference: z.string().trim().max(80).optional(),
  note: z.string().trim().max(300).optional(),
  clientKey: z.string().uuid(),
  /** Optional photo of the bill/receipt (base64 jpeg/png/webp ≤ 300 KB). */
  receipt: photoSchema.shape.data.optional(),
});

export const listExpensesQuery = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  categoryId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
});

const expenseView = (e: Prisma.ExpenseGetPayload<{ include: { category: { select: { name: true } } } }>) => ({
  id: e.id,
  voucherNumber: e.voucherNumber,
  category: e.category.name,
  categoryId: e.categoryId,
  amountPaisa: n(e.amountPaisa),
  spentOn: isoDate(e.spentOn)!,
  paidTo: e.paidTo,
  method: e.method,
  reference: e.reference,
  note: e.note,
  hasReceipt: !!e.receiptKey,
  reversed: !!e.reversedByExpenseId,
  isReversal: !!e.reversesExpenseId,
  reversalReason: e.reversalReason,
});

export async function listExpenses(ctx: AuthedContext, q: z.infer<typeof listExpensesQuery>) {
  return inTenant(ctx, async (tx) => {
    const clock = await schoolClock(tx);
    const to = q.to ?? clock.today;
    const from = q.from ?? `${to.slice(0, 7)}-01`;
    const where: Prisma.ExpenseWhereInput = {
      spentOn: { gte: toDate(from), lte: toDate(to) },
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
    };
    const PAGE = 50;
    const [total, rows, sum] = await Promise.all([
      tx.expense.count({ where }),
      tx.expense.findMany({
        where,
        include: { category: { select: { name: true } } },
        orderBy: [{ spentOn: 'desc' }, { voucherNumber: 'desc' }],
        skip: (q.page - 1) * PAGE,
        take: PAGE,
      }),
      tx.expense.aggregate({
        where: { ...where, reversedByExpenseId: null, reversesExpenseId: null },
        _sum: { amountPaisa: true },
      }),
    ]);
    return {
      from,
      to,
      items: rows.map(expenseView),
      total,
      page: q.page,
      pages: Math.ceil(total / PAGE),
      totalPaisa: n(sum._sum.amountPaisa),
    };
  });
}

export async function recordExpense(ctx: AuthedContext, input: z.infer<typeof expenseSchema>) {
  let upload: { key: string; buf: Uint8Array; type: string } | null = null;
  if (input.receipt) {
    const store = storage();
    if (!store) throw new AppError('CONFLICT', STORAGE_MISSING);
    const { buf, type, ext } = decodePhoto(input.receipt);
    upload = { key: `${newKey('finance', ctx.tenantId!, 'expenses')}.${ext}`, buf, type };
  }
  try {
    const r = await inTenant(ctx, async (tx) => {
      const tenantId = ctx.tenantId!;
      const dupe = await tx.expense.findUnique({
        where: { tenantId_clientKey: { tenantId, clientKey: input.clientKey } },
        include: { category: { select: { name: true } } },
      });
      if (dupe) return { expense: expenseView(dupe), duplicate: true };
      const clock = await schoolClock(tx);
      if (input.spentOn > clock.today) throw new AppError('VALIDATION_FAILED', 'Date cannot be in the future');
      const cat = await tx.expenseCategory.findUnique({ where: { id: input.categoryId } });
      if (!cat) throw notFound('Category');
      if (cat.archivedAt) throw new AppError('CONFLICT', 'That category is archived');
      const e = await tx.expense.create({
        data: {
          tenantId,
          categoryId: cat.id,
          amountPaisa: BigInt(input.amountPaisa),
          spentOn: toDate(input.spentOn),
          paidTo: input.paidTo,
          method: input.method,
          voucherNumber: await nextNumber(tx, tenantId, 'VOUCHER'),
          reference: input.reference || null,
          receiptKey: upload?.key ?? null,
          note: input.note || null,
          enteredBy: ctx.user.id,
          clientKey: input.clientKey,
        },
        include: { category: { select: { name: true } } },
      });
      await postLedger(tx, {
        tenantId,
        entryOn: input.spentOn,
        kind: 'EXPENSE',
        direction: 'OUT',
        amountPaisa: input.amountPaisa,
        method: input.method,
        refTable: 'expenses',
        refId: e.id,
        createdBy: ctx.user.id,
      });
      await audit(ctx, tx, {
        action: 'expense.record',
        entity: 'Expense',
        entityId: e.id,
        after: {
          voucherNumber: e.voucherNumber,
          category: cat.name,
          amountPaisa: input.amountPaisa,
          paidTo: input.paidTo,
        },
      });
      return { expense: expenseView(e), duplicate: false };
    });
    if (upload && !r.duplicate) await storage()!.put(upload.key, upload.buf, upload.type);
    return r;
  } catch (e) {
    friendlyDbError(e);
  }
}

export async function reverseExpense(ctx: AuthedContext, id: string, reason: string) {
  return inTenant(ctx, async (tx) => {
    const tenantId = ctx.tenantId!;
    const e = await tx.expense.findUnique({ where: { id } });
    if (!e) throw notFound('Expense');
    if (e.reversesExpenseId) throw new AppError('CONFLICT', 'A reversal cannot be reversed');
    if (e.reversedByExpenseId) throw new AppError('CONFLICT', 'This expense was already reversed');
    const clock = await schoolClock(tx);
    const rev = await tx.expense.create({
      data: {
        tenantId,
        categoryId: e.categoryId,
        amountPaisa: -e.amountPaisa,
        spentOn: toDate(clock.today),
        paidTo: e.paidTo,
        method: e.method,
        voucherNumber: await nextNumber(tx, tenantId, 'VOUCHER'),
        reference: e.reference,
        enteredBy: ctx.user.id,
        reversesExpenseId: e.id,
        reversalReason: reason,
      },
    });
    await tx.expense.update({ where: { id }, data: { reversedByExpenseId: rev.id } });
    await postLedger(tx, {
      tenantId,
      entryOn: clock.today,
      kind: 'REVERSAL',
      direction: 'IN',
      amountPaisa: e.amountPaisa,
      method: e.method,
      refTable: 'expenses',
      refId: rev.id,
      createdBy: ctx.user.id,
    });
    await audit(ctx, tx, {
      action: 'expense.reverse',
      entity: 'Expense',
      entityId: id,
      before: { voucherNumber: e.voucherNumber, amountPaisa: n(e.amountPaisa) },
      after: { reason, reversalVoucher: rev.voucherNumber },
    });
    return { reversal: { id: rev.id, voucherNumber: rev.voucherNumber } };
  });
}

export async function expenseReceipt(ctx: AuthedContext, id: string) {
  const row = await inTenant(ctx, (tx) => tx.expense.findUnique({ where: { id }, select: { receiptKey: true } }));
  if (!row?.receiptKey) throw notFound('Receipt image');
  const file = await storage()?.get(row.receiptKey);
  if (!file) throw notFound('Receipt image');
  return new Response(file.body as unknown as BodyInit, {
    headers: {
      'Content-Type': file.contentType,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    },
  });
}
