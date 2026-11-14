import 'server-only';
import { Prisma } from '@prisma/client';
import type { TenantTx } from '@/server/db/client';

/**
 * Row locks that serialise money writes (`SELECT … FOR UPDATE`, held until the transaction ends). Read Committed
 * lets two requests both read "balance 5,000" or "claim pending" and both act; taking the lock first makes the second
 * request wait and then see the first one's result. RLS still applies, so a row of another school is never locked.
 */
const TABLES = {
  student: 'students',
  claim: 'payment_claims',
  payrollRun: 'payroll_runs',
  expense: 'expenses',
  payment: 'payments',
} as const;

export async function lockRow(tx: TenantTx, kind: keyof typeof TABLES, id: string): Promise<boolean> {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM ${Prisma.raw(TABLES[kind])} WHERE id = ${id}::uuid FOR UPDATE`;
  return rows.length > 0;
}
