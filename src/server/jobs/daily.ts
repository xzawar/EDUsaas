import 'server-only';
import crypto from 'node:crypto';
import { purgeExpiredCredentials } from '@/server/auth/service';
import { purgeRateLimits } from '@/server/auth/ratelimit';
import { recordAudit } from '@/server/audit/audit';
import { systemDb } from '@/server/db/system';
import { expireGrants } from '@/server/platform/support';

/**
 * Daily maintenance (cron, decision D8). Each step is independent and idempotent, so a missed or repeated run is
 * harmless. Runs with the system role because it spans schools; every school-visible effect is audited per school.
 */

export const RETENTION_DAYS = 365; // decision D7
const DAY = 86400_000;

function localParts(now: Date, timezone: string) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const parts = Object.fromEntries(f.formatToParts(now).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, weekday: parts.weekday };
}

/** D7: one year after withdrawal, remove what identifies a student; attendance and marks stay as anonymous history. */
export async function anonymizeWithdrawn(now = new Date()) {
  const db = systemDb();
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * DAY);
  const due = await db.student.findMany({
    where: { status: 'WITHDRAWN', withdrawnAt: { lt: cutoff }, user: { displayName: { not: 'Former student' } } },
    select: { id: true, tenantId: true, userId: true, tenant: { select: { prefix: true } } },
    take: 500,
  });
  const perTenant = new Map<string, number>();
  for (const s of due) {
    const handle = `${s.tenant.prefix}-former-${crypto.randomBytes(4).toString('hex')}`;
    await db.$transaction([
      db.user.update({
        where: { id: s.userId },
        data: {
          displayName: 'Former student',
          username: handle,
          usernameNormalized: handle,
          email: null,
          status: 'DISABLED',
        },
      }),
      db.student.update({
        where: { id: s.id },
        data: { guardianName: null, guardianPhone: null, address: null, dateOfBirth: null, gender: null },
      }),
      db.session.deleteMany({ where: { userId: s.userId } }),
    ]);
    perTenant.set(s.tenantId, (perTenant.get(s.tenantId) ?? 0) + 1);
  }
  for (const [tenantId, count] of perTenant) {
    await recordAudit({
      tenantId,
      action: 'retention.anonymize',
      entity: 'Student',
      metadata: { count, olderThanDays: RETENTION_DAYS },
    });
  }
  return due.length;
}

/** Tell School Admins about student leave requests that aged out to them in the last day (decision D5). */
export async function leaveEscalations(now = new Date()) {
  const db = systemDb();
  const tenants = await db.tenant.findMany({
    where: { status: { not: 'SUSPENDED' } },
    select: { id: true, settings: { select: { leaveAgeOutHours: true } } },
  });
  let sent = 0;
  for (const t of tenants) {
    const hours = t.settings?.leaveAgeOutHours ?? 48;
    const newest = new Date(now.getTime() - hours * 3600_000);
    const oldest = new Date(newest.getTime() - DAY);
    const count = await db.leaveRequest.count({
      where: { tenantId: t.id, status: 'PENDING', studentId: { not: null }, createdAt: { lte: newest, gt: oldest } },
    });
    if (!count) continue;
    const admins = await db.user.findMany({
      where: { tenantId: t.id, role: 'SCHOOL_ADMIN', status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });
    if (!admins.length) continue;
    await db.notification.createMany({
      data: admins.map((a) => ({
        tenantId: t.id,
        userId: a.id,
        kind: 'leave',
        title: `${count} leave request${count === 1 ? '' : 's'} now need you`,
        body: `Class Incharges didn’t decide within ${hours} hours, so these student requests moved to you.`,
        link: '/staff/leave?tab=approve',
      })),
    });
    sent += admins.length;
  }
  return sent;
}

/** Monday digest for Class Incharges: students in their section below the school's attendance target. */
export async function atRiskDigest(now = new Date(), force = false) {
  const db = systemDb();
  const tenants = await db.tenant.findMany({
    where: { status: { not: 'SUSPENDED' } },
    select: { id: true, settings: { select: { timezone: true, atRiskThreshold: true } } },
  });
  let sent = 0;
  for (const t of tenants) {
    const tz = t.settings?.timezone ?? 'Asia/Karachi';
    const { date, weekday } = localParts(now, tz);
    if (!force && weekday !== 'Mon') continue;
    const marker = `at_risk_digest:${date}`;
    if (await db.job.findFirst({ where: { tenantId: t.id, type: marker } })) continue;
    const threshold = t.settings?.atRiskThreshold ?? 75;
    const rows = await db.$queryRaw<{ section_id: string; incharge_user: string; label: string; n: bigint }[]>`
      WITH per_student AS (
        SELECT s.id, s.section_id,
               COUNT(*) FILTER (WHERE r.status IN ('PRESENT','LATE')) AS attended,
               COUNT(*) FILTER (WHERE r.status IN ('PRESENT','LATE','ABSENT')) AS considered
        FROM students s
        JOIN attendance_records r ON r.student_id = s.id
        JOIN attendance_batches b ON b.id = r.batch_id AND b.period = 1
        JOIN sections sec ON sec.id = s.section_id
        JOIN classes c ON c.id = sec.class_id
        JOIN academic_years y ON y.id = c.academic_year_id AND y.status = 'CURRENT' AND b.date >= y.starts_on
        WHERE s.tenant_id = ${t.id}::uuid AND s.status = 'ACTIVE'
        GROUP BY s.id, s.section_id
      )
      SELECT p.section_id, tu.user_id AS incharge_user, c.name || '-' || sec.name AS label, COUNT(*) AS n
      FROM per_student p
      JOIN sections sec ON sec.id = p.section_id
      JOIN classes c ON c.id = sec.class_id
      JOIN teachers tu ON tu.id = sec.class_teacher_id
      WHERE p.considered >= 10 AND p.attended * 100.0 / p.considered < ${threshold}
      GROUP BY p.section_id, tu.user_id, c.name, sec.name`;
    if (rows.length) {
      await db.notification.createMany({
        data: rows.map((r) => ({
          tenantId: t.id,
          userId: r.incharge_user,
          kind: 'attendance',
          title: `${r.n} student${Number(r.n) === 1 ? '' : 's'} in ${r.label} below ${threshold}%`,
          body: 'Their attendance this year is under the school target. A call home can help.',
          link: `/staff/attendance/${r.section_id}/month`,
        })),
      });
      sent += rows.length;
    }
    await db.job.create({
      data: { tenantId: t.id, type: marker, status: 'SUCCEEDED', payload: { sections: rows.length }, finishedAt: now },
    });
  }
  return sent;
}

/**
 * Monthly audit archival (plan §8.13) needs object storage (decision D14). Until a bucket is configured the
 * audit log simply stays in the database, which is safe — just larger.
 */
export function auditArchival() {
  const configured = !!process.env.STORAGE_BUCKET;
  return configured ? 'not-implemented' : 'skipped: storage not configured';
}

export async function runDaily(now = new Date()) {
  const results: Record<string, unknown> = {};
  const step = async (name: string, fn: () => Promise<unknown> | unknown) => {
    try {
      results[name] = await fn();
    } catch (e) {
      results[name] = { error: (e as Error).message };
      console.error(`daily job ${name} failed`, e);
    }
  };
  await step('credentials', () => purgeExpiredCredentials());
  await step('rateLimits', () => purgeRateLimits());
  await step('supportGrantsExpired', () => expireGrants());
  await step('leaveEscalationNotices', () => leaveEscalations(now));
  await step('atRiskDigests', () => atRiskDigest(now));
  await step('studentsAnonymized', () => anonymizeWithdrawn(now));
  await step('auditArchive', () => auditArchival());
  return results;
}
