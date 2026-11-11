import 'server-only';
import type { SequenceKind } from '@prisma/client';
import type { TenantTx } from '@/server/db/client';

const PREFIX: Record<SequenceKind, string> = { RECEIPT: 'R', INVOICE: 'I', VOUCHER: 'V', PAYSLIP: 'P' };

/**
 * Gap-free per-school numbers (Finance spec §2.3): "R-000123". The counter row is upserted and incremented in one
 * statement inside the caller's transaction, so concurrent writers queue on the row lock and never share a number.
 * If the caller's transaction rolls back, the number is released with it.
 */
export async function nextNumber(tx: TenantTx, tenantId: string, kind: SequenceKind): Promise<string> {
  const rows = await tx.$queryRaw<{ n: number }[]>`
    INSERT INTO finance_sequences (tenant_id, kind, next) VALUES (${tenantId}::uuid, ${kind}::"SequenceKind", 2)
    ON CONFLICT (tenant_id, kind) DO UPDATE SET next = finance_sequences.next + 1
    RETURNING (next - 1)::int AS n`;
  const n = rows[0]?.n;
  if (!n) throw new Error('finance sequence failed');
  return `${PREFIX[kind]}-${String(n).padStart(6, '0')}`;
}
