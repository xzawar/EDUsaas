import 'server-only';
import crypto from 'node:crypto';
import type { AttendanceStatus, Prisma } from '@prisma/client';
import { systemDb } from '@/server/db/system';

/**
 * Demo only (decision D8): keeps the two sample schools "alive" so the dashboards always have recent history and
 * a partly-finished today. Runs from the daily job, and only when DEMO_SEED=true — never for a real school.
 * Mirrors prisma/seed.ts: most students ~94%, every 23rd roll number ~68% (so "at risk" has entries); today about
 * two thirds of registers are taken and most teachers have checked in (the demo teacher hasn't, so check-in works).
 */

const DEMO_PREFIXES = ['bss', 'gvs'];
const MAX_BACKFILL_DAYS = 30;

const dayIn = (d: Date, tz: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const isSchoolDay = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay() !== 0; // Mon–Sat
const statusFor = (risky: boolean): AttendanceStatus => {
  const r = Math.random();
  if (risky) return r < 0.62 ? 'PRESENT' : r < 0.68 ? 'LATE' : r < 0.97 ? 'ABSENT' : 'LEAVE';
  return r < 0.9 ? 'PRESENT' : r < 0.95 ? 'LATE' : r < 0.985 ? 'ABSENT' : 'LEAVE';
};

export async function refreshDemoData(now = new Date(), prefixes: string[] = DEMO_PREFIXES) {
  if (process.env.DEMO_SEED !== 'true') return 'skipped: not a demo deployment';
  const db = systemDb();
  const tenants = await db.tenant.findMany({
    where: { prefix: { in: prefixes }, status: { not: 'SUSPENDED' } },
    select: { id: true, prefix: true, settings: { select: { timezone: true } } },
  });
  const summary: Record<string, { registers: number; checkIns: number }> = {};
  for (const t of tenants) {
    const today = dayIn(now, t.settings?.timezone ?? 'Asia/Karachi');
    const year = await db.academicYear.findFirst({ where: { tenantId: t.id, status: 'CURRENT' } });
    if (!year) continue;
    const yearStart = year.startsOn.toISOString().slice(0, 10);
    const sections = await db.section.findMany({
      where: { tenantId: t.id, class: { academicYearId: year.id } },
      orderBy: [{ class: { gradeLevel: 'asc' } }, { name: 'asc' }],
      select: {
        id: true,
        classTeacher: { select: { userId: true } },
        students: { where: { status: 'ACTIVE' }, select: { id: true, rollNumber: true } },
        attendance: { where: { period: 1 }, orderBy: { date: 'desc' }, take: 1, select: { date: true } },
      },
    });
    const admin = await db.user.findFirst({ where: { tenantId: t.id, role: 'SCHOOL_ADMIN' }, select: { id: true } });
    const batches: Prisma.AttendanceBatchCreateManyInput[] = [];
    const records: Prisma.AttendanceRecordCreateManyInput[] = [];
    for (const [i, s] of sections.entries()) {
      if (!s.students.length) continue;
      const last = s.attendance[0]?.date.toISOString().slice(0, 10) ?? addDays(today, -MAX_BACKFILL_DAYS);
      const from = [addDays(last, 1), addDays(today, -MAX_BACKFILL_DAYS), yearStart].sort().at(-1)!;
      for (let d = from; d <= today; d = addDays(d, 1)) {
        if (!isSchoolDay(d)) continue;
        if (d === today && i % 3 === 2) continue; // leave a third of today's registers for the demo to show
        const id = crypto.randomUUID();
        batches.push({
          id,
          tenantId: t.id,
          sectionId: s.id,
          date: new Date(`${d}T00:00:00Z`),
          period: 1,
          submittedBy: s.classTeacher?.userId ?? admin!.id,
          clientUuid: crypto.randomUUID(),
          serverReceivedAt: new Date(`${d}T03:15:00Z`),
        });
        for (const st of s.students)
          records.push({
            tenantId: t.id,
            batchId: id,
            studentId: st.id,
            status: statusFor((st.rollNumber ?? 0) % 23 === 7),
          });
      }
    }
    // Insert batches first; only records whose batch was actually created (not skipped as a duplicate) follow.
    const created = new Set<string>();
    for (let k = 0; k < batches.length; k += 500) {
      const part = batches.slice(k, k + 500);
      await db.attendanceBatch.createMany({ data: part, skipDuplicates: true });
      const ok = await db.attendanceBatch.findMany({
        where: { id: { in: part.map((b) => b.id!) } },
        select: { id: true },
      });
      for (const b of ok) created.add(b.id);
    }
    const keep = records.filter((r) => created.has(r.batchId));
    for (let k = 0; k < keep.length; k += 3000) await db.attendanceRecord.createMany({ data: keep.slice(k, k + 3000) });

    // Teacher check-ins: every missed school day, plus most teachers today.
    const teachers = await db.teacher.findMany({
      where: { tenantId: t.id, user: { status: 'ACTIVE' } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, user: { select: { username: true } } },
    });
    // Per teacher, per day: existing rows are kept (unique teacher+date), so one early check-in never blocks the rest.
    const from = [addDays(today, -14), yearStart].sort().at(-1)!;
    const checkins: Prisma.TeacherAttendanceCreateManyInput[] = [];
    for (let d = from; d <= today; d = addDays(d, 1)) {
      if (!isSchoolDay(d)) continue;
      for (const [i, tch] of teachers.entries()) {
        if (d === today && (i % 4 === 3 || tch.user.username?.endsWith('-t-alikhan-1'))) continue;
        const r = Math.random();
        const status =
          d === today ? (i % 7 === 5 ? 'LATE' : 'PRESENT') : r < 0.88 ? 'PRESENT' : r < 0.95 ? 'LATE' : 'ABSENT';
        checkins.push({
          tenantId: t.id,
          teacherId: tch.id,
          date: new Date(`${d}T00:00:00Z`),
          status,
          checkedInAt:
            status === 'ABSENT' ? null : new Date(`${d}T0${status === 'LATE' ? '3:25' : `2:5${i % 10}`}:00Z`),
        });
      }
    }
    const c = await db.teacherAttendance.createMany({ data: checkins, skipDuplicates: true });
    summary[t.prefix] = { registers: created.size, checkIns: c.count };
  }
  return summary;
}
