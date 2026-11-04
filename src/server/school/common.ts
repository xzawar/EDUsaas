import 'server-only';
import { Prisma } from '@prisma/client';
import { withTenant, type TenantTx } from '@/server/db/client';
import { auditInTx, type AuditEntry } from '@/server/audit/audit';
import { AppError, notFound } from '@/server/http/errors';
import type { AuthedContext } from '@/server/http/route';

export function requireTenant(ctx: AuthedContext): string {
  if (!ctx.tenantId) throw new AppError('FORBIDDEN', 'This action is only available to school accounts');
  return ctx.tenantId;
}

/** Runs fn in the caller's tenant transaction (RLS-scoped). */
export function inTenant<T>(ctx: AuthedContext, fn: (tx: TenantTx) => Promise<T>, timeoutMs?: number): Promise<T> {
  return withTenant({ tenantId: requireTenant(ctx), userId: ctx.user.id }, fn, { timeoutMs });
}

/** Audit inside the current transaction with actor/request fields filled from the context. */
export function audit(
  ctx: AuthedContext,
  tx: TenantTx,
  entry: Omit<AuditEntry, 'tenantId' | 'actorId' | 'actorRole' | 'requestId' | 'ipHash' | 'userAgent'>,
) {
  return auditInTx(tx, {
    ...entry,
    tenantId: ctx.tenantId,
    actorId: ctx.user.id,
    actorRole: ctx.user.role,
    requestId: ctx.requestId,
    ipHash: ctx.ipHash,
    userAgent: ctx.userAgent,
  });
}

/** Turns unique-constraint and cross-tenant-trigger errors into friendly API errors. */
export function friendlyDbError(e: unknown, messages: Record<string, string> = {}): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2002') {
      const target = String((e.meta as { target?: unknown })?.target ?? '');
      const key = Object.keys(messages).find((k) => target.includes(k));
      throw new AppError('CONFLICT', key ? messages[key]! : 'That already exists', { field: key });
    }
    if (e.code === 'P2003') throw new AppError('CONFLICT', messages.fk ?? 'This is still in use and cannot be changed');
    if (e.code === 'P2025') throw notFound();
  }
  const msg = (e as Error)?.message ?? '';
  if (msg.includes('cross-tenant reference rejected')) throw new AppError('NOT_FOUND', 'Referenced record not found');
  throw e;
}

/** Days → ms helper for date windows. */
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse a YYYY-MM-DD date as a UTC date (Postgres DATE columns). */
export function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function isoDate(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** Default grading scale (decision D11), highest band first. */
export const DEFAULT_GRADING_BANDS = [
  { grade: 'A1', min: 90 },
  { grade: 'A', min: 80 },
  { grade: 'B', min: 70 },
  { grade: 'C', min: 60 },
  { grade: 'D', min: 50 },
  { grade: 'E', min: 40 },
  { grade: 'F', min: 0 },
];

/**
 * A teacher's reach (spec §2.4, §4): sections where they teach a subject, plus sections where they are Class Incharge.
 */
export async function teacherScope(tx: TenantTx, userId: string) {
  const teacher = await tx.teacher.findUnique({
    where: { userId },
    select: {
      id: true,
      assignments: { select: { sectionId: true, subjectId: true } },
      inchargeOf: { select: { id: true } },
    },
  });
  if (!teacher)
    return { teacherId: null, sectionIds: [] as string[], inchargeSectionIds: [] as string[], assignments: [] };
  const inchargeSectionIds = teacher.inchargeOf.map((s) => s.id);
  const sectionIds = [...new Set([...teacher.assignments.map((a) => a.sectionId), ...inchargeSectionIds])];
  return { teacherId: teacher.id, sectionIds, inchargeSectionIds, assignments: teacher.assignments };
}

export function sectionLabel(s: { name: string; class: { name: string } }) {
  return `${s.class.name}-${s.name}`;
}

// ── School-local dates (decision D6) ────────────────────────────────────────

/** YYYY-MM-DD for an instant in a timezone. */
export function dateInTz(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

/** HH:MM for an instant in a timezone. */
export function timeInTz(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(instant);
}

export function addDays(isoDay: string, days: number): string {
  const d = new Date(`${isoDay}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 1 = Monday … 7 = Sunday */
export function weekday(isoDay: string): number {
  const d = new Date(`${isoDay}T00:00:00.000Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export async function schoolClock(tx: TenantTx) {
  const s = await tx.tenantSettings.findFirst({ select: { timezone: true, atRiskThreshold: true, leaveAgeOutHours: true, marksPublisher: true, attendanceMode: true } });
  const timezone = s?.timezone ?? 'Asia/Karachi';
  const now = new Date();
  return {
    timezone,
    now,
    today: dateInTz(now, timezone),
    time: timeInTz(now, timezone),
    atRiskThreshold: s?.atRiskThreshold ?? 75,
    leaveAgeOutHours: s?.leaveAgeOutHours ?? 48,
    marksPublisher: s?.marksPublisher ?? 'SCHOOL_ADMIN',
    attendanceMode: s?.attendanceMode ?? 'ONCE_DAILY',
  };
}

/** Attendance % rules (shown in the UI): Present + Late count as attended; approved Leave and Excused days don't count against. */
export function attendancePct(c: { PRESENT: number; LATE: number; ABSENT: number; LEAVE: number; EXCUSED: number }): number | null {
  const considered = c.PRESENT + c.LATE + c.ABSENT;
  if (considered === 0) return null;
  return Math.round(((c.PRESENT + c.LATE) / considered) * 1000) / 10;
}

export const ATTENDANCE_CORRECTION_DAYS = 3;
export const MARKS_CORRECTION_DAYS = 7;
