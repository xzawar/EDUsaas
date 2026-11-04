import 'server-only';
import type { Prisma, UserRole } from '@prisma/client';
import { systemDb } from '@/server/db/system';
import type { TenantTx } from '@/server/db/client';

export type AuditEntry = {
  tenantId?: string | null;
  actorId?: string | null;
  actorRole?: UserRole | null;
  action: string;
  entity: string;
  entityId?: string | null;
  outcome?: 'success' | 'denied' | 'failure';
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  ipHash?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
};

// Spec §9.7: never log passwords, tokens, session secrets or credentials — even by accident.
const SECRET_KEY = /pass(word)?|token|secret|hash|cookie|credential|authorization/i;

export function scrub(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined || depth > 6) return value ?? null;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) ? '[redacted]' : scrub(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'bigint') return value.toString();
  return value;
}

function toData(e: AuditEntry): Prisma.AuditLogUncheckedCreateInput {
  const json = (v: unknown) => (v === undefined ? undefined : (scrub(v) as Prisma.InputJsonValue));
  return {
    tenantId: e.tenantId ?? null,
    actorId: e.actorId ?? null,
    actorRole: e.actorRole ?? null,
    action: e.action,
    entity: e.entity,
    entityId: e.entityId ?? null,
    outcome: e.outcome ?? 'success',
    before: json(e.before),
    after: json(e.after),
    metadata: json(e.metadata),
    ipHash: e.ipHash ?? null,
    userAgent: e.userAgent ?? null,
    requestId: e.requestId ?? null,
  };
}

/** Write inside the caller's tenant transaction, so the audit row commits/rolls back with the change. */
export async function auditInTx(tx: TenantTx, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({ data: toData(entry) });
}

/** Standalone write (auth events, platform actions, denied attempts). Never throws into the caller. */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await systemDb().auditLog.create({ data: toData(entry) });
  } catch (err) {
    console.error('audit write failed', { action: entry.action, entity: entry.entity, err: (err as Error).message });
  }
}
