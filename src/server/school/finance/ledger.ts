import 'server-only';
import type { LedgerDirection, LedgerKind, PaymentMethod } from '@prisma/client';
import type { TenantTx } from '@/server/db/client';
import { toDate } from '@/server/school/common';

/**
 * The ledger (Finance spec §2.2): one append-only row for every rupee in or out. Reports read only this table.
 * Rows are never updated or deleted (database trigger); mistakes are reversed with a counter-entry.
 */
export async function postLedger(
  tx: TenantTx,
  e: {
    tenantId: string;
    entryOn: string;
    kind: LedgerKind;
    direction: LedgerDirection;
    amountPaisa: number | bigint;
    method?: PaymentMethod | null;
    refTable: 'payments' | 'expenses' | 'payslips';
    refId: string;
    studentId?: string | null;
    userId?: string | null;
    createdBy?: string | null;
  },
) {
  const amount = BigInt(e.amountPaisa);
  if (amount <= 0n) throw new Error('ledger amounts are positive; use direction for the sign');
  return tx.ledgerEntry.create({
    data: {
      tenantId: e.tenantId,
      entryOn: toDate(e.entryOn),
      kind: e.kind,
      direction: e.direction,
      amountPaisa: amount,
      method: e.method ?? null,
      refTable: e.refTable,
      refId: e.refId,
      studentId: e.studentId ?? null,
      userId: e.userId ?? null,
      createdBy: e.createdBy ?? null,
    },
  });
}
