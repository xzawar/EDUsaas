import 'server-only';
import { z } from 'zod';
import { notFound } from '@/server/http/errors';
import type { AuthedContext } from '@/server/http/route';
import { audit, inTenant } from '@/server/school/common';
import type { TenantTx } from '@/server/db/client';

/**
 * Where parents send fees: the school's bank account and mobile wallets. The School Admin (or anyone with
 * fees.manage) keeps this list; students see the active ones on their Fees screen under "Paid by".
 */

export const ONLINE_METHODS = ['BANK', 'JAZZCASH', 'EASYPAISA'] as const;

export const paymentAccountSchema = z.object({
  method: z.enum(ONLINE_METHODS),
  label: z.string().trim().min(2, 'Add the bank or wallet name').max(60),
  accountTitle: z.string().trim().min(2, 'Add the account title').max(120),
  accountNumber: z.string().trim().min(4, 'Add the account or mobile number').max(40),
  iban: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/, 'That doesn’t look like an IBAN')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  active: z.boolean().default(true),
});

export type PaymentAccountView = {
  id: string;
  method: (typeof ONLINE_METHODS)[number];
  label: string;
  accountTitle: string;
  accountNumber: string;
  iban: string | null;
  active: boolean;
};

export async function paymentAccountsIn(tx: TenantTx, onlyActive: boolean): Promise<PaymentAccountView[]> {
  const rows = await tx.paymentAccount.findMany({
    where: { method: { in: [...ONLINE_METHODS] }, ...(onlyActive ? { active: true } : {}) },
    orderBy: [{ method: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map((r) => ({
    id: r.id,
    method: r.method as PaymentAccountView['method'],
    label: r.label,
    accountTitle: r.accountTitle,
    accountNumber: r.accountNumber,
    iban: r.iban,
    active: r.active,
  }));
}

export async function listPaymentAccounts(ctx: AuthedContext) {
  return inTenant(ctx, (tx) => paymentAccountsIn(tx, !ctx.can('fees.manage')));
}

export async function createPaymentAccount(ctx: AuthedContext, input: z.infer<typeof paymentAccountSchema>) {
  return inTenant(ctx, async (tx) => {
    const row = await tx.paymentAccount.create({
      data: { ...input, iban: input.iban ?? null, tenantId: ctx.tenantId! },
    });
    await audit(ctx, tx, {
      action: 'payment_account.create',
      entity: 'PaymentAccount',
      entityId: row.id,
      after: input,
    });
    return { id: row.id };
  });
}

export async function updatePaymentAccount(
  ctx: AuthedContext,
  id: string,
  input: z.infer<typeof paymentAccountSchema>,
) {
  return inTenant(ctx, async (tx) => {
    const before = await tx.paymentAccount.findUnique({ where: { id } });
    if (!before) throw notFound('Account');
    await tx.paymentAccount.update({ where: { id }, data: { ...input, iban: input.iban ?? null } });
    await audit(ctx, tx, {
      action: 'payment_account.update',
      entity: 'PaymentAccount',
      entityId: id,
      before: { label: before.label, accountNumber: before.accountNumber, active: before.active },
      after: input,
    });
    return { ok: true };
  });
}

export async function deletePaymentAccount(ctx: AuthedContext, id: string) {
  return inTenant(ctx, async (tx) => {
    const before = await tx.paymentAccount.findUnique({ where: { id } });
    if (!before) throw notFound('Account');
    await tx.paymentAccount.delete({ where: { id } });
    await audit(ctx, tx, {
      action: 'payment_account.delete',
      entity: 'PaymentAccount',
      entityId: id,
      before: { label: before.label, accountNumber: before.accountNumber },
    });
    return { ok: true };
  });
}
