import 'server-only';
import type { AttendanceStatus } from '@prisma/client';
import { z } from 'zod';
import { toCsv, type Cell } from '@/server/files/csv';
import { AppError, notFound } from '@/server/http/errors';
import type { AuthedContext } from '@/server/http/route';
import {
  addDays,
  attendancePct,
  countedPeriods,
  countedPeriodsSql,
  inTenant,
  isoDate,
  schoolClock,
  sectionLabel,
  toDate,
} from '@/server/school/common';
import { countsByStudent } from '@/server/school/attendance';
import { gradeFor } from '@/server/school/assessments';

/**
 * Reports (spec §8.10): attendance by section and date range, marks summary, at-risk list. Every report can be
 * downloaded as CSV (formula-neutralised). Guardian contact details appear only for the School Admin.
 */

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
type Band = { grade: string; min: number };
/** Fewer recorded days than this in a range is too little to call a student "below" the target. */
export const MIN_DAYS = 5;
const zero = (): Record<AttendanceStatus, number> => ({ PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0, EXCUSED: 0 });

async function currentYear(ctx: AuthedContext) {
  return inTenant(ctx, async (tx) => {
    const year = await tx.academicYear.findFirst({ where: { status: 'CURRENT' } });
    if (!year) throw new AppError('VALIDATION_FAILED', 'Set a current academic year first');
    return year;
  });
}

// ── Attendance ───────────────────────────────────────────────────────────────

export const attendanceReportQuery = z.object({
  sectionId: z.string().uuid().optional(),
  from: dateStr.optional(),
  to: dateStr.optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

export async function attendanceReport(ctx: AuthedContext, q: z.infer<typeof attendanceReportQuery>) {
  await currentYear(ctx);
  return inTenant(ctx, async (tx) => {
    const clock = await schoolClock(tx);
    const to = q.to && q.to <= clock.today ? q.to : clock.today;
    const from = q.from && q.from <= to ? q.from : addDays(to, -29);
    if (addDays(from, 400) < to) throw new AppError('VALIDATION_FAILED', 'Choose a range of at most a year');
    const range = { gte: toDate(from), lte: toDate(to) };

    if (q.sectionId) {
      const section = await tx.section.findUnique({ where: { id: q.sectionId }, include: { class: true } });
      if (!section) throw notFound('Section');
      const [students, registers] = await Promise.all([
        tx.student.findMany({
          where: { sectionId: section.id, status: 'ACTIVE' },
          include: { user: { select: { displayName: true } } },
          orderBy: { rollNumber: 'asc' },
        }),
        tx.attendanceBatch.count({
          where: { sectionId: section.id, ...countedPeriods(clock.attendanceMode), date: range },
        }),
      ]);
      const counts = await countsByStudent(tx, {
        batch: { sectionId: section.id, ...countedPeriods(clock.attendanceMode), date: range },
      });
      const rows = students.map((s) => {
        const c = counts.get(s.id) ?? zero();
        return { id: s.id, rollNumber: s.rollNumber, name: s.user.displayName, ...c, pct: attendancePct(c) };
      });
      const total = rows.reduce((acc, r) => {
        for (const k of Object.keys(acc) as AttendanceStatus[]) acc[k] += r[k];
        return acc;
      }, zero());
      return {
        kind: 'section' as const,
        from,
        to,
        threshold: clock.atRiskThreshold,
        section: { id: section.id, label: sectionLabel(section) },
        registers,
        overallPct: attendancePct(total),
        rows,
      };
    }

    const sections = await tx.section.findMany({
      where: { class: { academicYear: { status: 'CURRENT' } } },
      include: {
        class: true,
        classTeacher: { include: { user: { select: { displayName: true } } } },
        _count: { select: { students: { where: { status: 'ACTIVE' } } } },
      },
      orderBy: [{ class: { gradeLevel: 'asc' } }, { name: 'asc' }],
    });
    const agg = await tx.$queryRaw<{ section_id: string; registers: bigint; attended: bigint; considered: bigint }[]>`
      SELECT b.section_id,
             COUNT(DISTINCT b.id) AS registers,
             COUNT(r.id) FILTER (WHERE r.status IN ('PRESENT','LATE')) AS attended,
             COUNT(r.id) FILTER (WHERE r.status IN ('PRESENT','LATE','ABSENT')) AS considered
      FROM attendance_batches b LEFT JOIN attendance_records r ON r.batch_id = b.id
      WHERE b.date >= ${toDate(from)} AND b.date <= ${toDate(to)} ${countedPeriodsSql(clock.attendanceMode)}
      GROUP BY b.section_id`;
    const by = new Map(agg.map((a) => [a.section_id, a]));
    const perStudent = await countsByStudent(tx, {
      batch: { ...countedPeriods(clock.attendanceMode), date: range },
      student: { status: 'ACTIVE' },
    });
    const below = new Map<string, number>();
    const studentSection = new Map(
      (
        await tx.student.findMany({
          where: { status: 'ACTIVE', id: { in: [...perStudent.keys()] } },
          select: { id: true, sectionId: true },
        })
      ).map((s) => [s.id, s.sectionId]),
    );
    for (const [id, c] of perStudent) {
      const pct = attendancePct(c);
      const sid = studentSection.get(id);
      // Count someone as "below" only with enough recorded days in the range to mean something.
      if (sid && pct !== null && c.PRESENT + c.LATE + c.ABSENT >= MIN_DAYS && pct < clock.atRiskThreshold)
        below.set(sid, (below.get(sid) ?? 0) + 1);
    }
    const rows = sections.map((s) => {
      const a = by.get(s.id);
      const considered = Number(a?.considered ?? 0);
      return {
        id: s.id,
        label: sectionLabel(s),
        incharge: s.classTeacher?.user.displayName ?? null,
        students: s._count.students,
        registers: Number(a?.registers ?? 0),
        pct: considered ? Math.round((Number(a!.attended) / considered) * 1000) / 10 : null,
        below: below.get(s.id) ?? 0,
      };
    });
    const att = rows.reduce((x, r) => x + Number(by.get(r.id)?.attended ?? 0), 0);
    const con = rows.reduce((x, r) => x + Number(by.get(r.id)?.considered ?? 0), 0);
    return {
      kind: 'school' as const,
      from,
      to,
      threshold: clock.atRiskThreshold,
      overallPct: con ? Math.round((att / con) * 1000) / 10 : null,
      rows,
    };
  });
}

export function attendanceCsv(r: Awaited<ReturnType<typeof attendanceReport>>) {
  if (r.kind === 'section') {
    return toCsv(
      ['Roll', 'Student', 'Present', 'Late', 'Absent', 'Leave', 'Excused', 'Attendance %'],
      r.rows.map((x) => [x.rollNumber, x.name, x.PRESENT, x.LATE, x.ABSENT, x.LEAVE, x.EXCUSED, x.pct]),
    );
  }
  return toCsv(
    ['Section', 'Class Incharge', 'Students', 'Registers taken', 'Attendance %', `Below ${r.threshold}%`],
    r.rows.map((x) => [x.label, x.incharge, x.students, x.registers, x.pct, x.below]),
  );
}

// ── Marks ────────────────────────────────────────────────────────────────────

export const marksReportQuery = z.object({
  sectionId: z.string().uuid().optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

const passMark = (bands: Band[]) => {
  const sorted = [...bands].sort((a, b) => a.min - b.min);
  return sorted[1]?.min ?? 0;
};

export async function marksReport(ctx: AuthedContext, q: z.infer<typeof marksReportQuery>) {
  const year = await currentYear(ctx);
  return inTenant(ctx, async (tx) => {
    const assessments = await tx.assessment.findMany({
      where: {
        academicYearId: year.id,
        status: { in: ['SUBMITTED', 'PUBLISHED'] },
        ...(q.sectionId ? { sectionId: q.sectionId } : {}),
      },
      include: {
        section: { include: { class: true } },
        subject: { select: { name: true } },
        gradingScheme: true,
        marks: true,
      },
      orderBy: [{ heldOn: 'asc' }, { name: 'asc' }],
      take: 500,
    });
    const summary = assessments
      .map((a) => {
        const pcts = a.marks.filter((m) => m.score !== null).map((m) => (Number(m.score) / Number(a.maxMarks)) * 100);
        const pass = passMark(a.gradingScheme.bands as Band[]);
        const avg = pcts.length ? pcts.reduce((x, y) => x + y, 0) / pcts.length : null;
        return {
          id: a.id,
          name: a.name,
          section: sectionLabel(a.section),
          subject: a.subject.name,
          heldOn: isoDate(a.heldOn)!,
          status: a.status,
          entered: pcts.length,
          absent: a.marks.filter((m) => m.absent).length,
          average: avg === null ? null : Math.round(avg * 10) / 10,
          highest: pcts.length ? Math.round(Math.max(...pcts) * 10) / 10 : null,
          lowest: pcts.length ? Math.round(Math.min(...pcts) * 10) / 10 : null,
          passRate: pcts.length ? Math.round((pcts.filter((p) => p >= pass).length / pcts.length) * 1000) / 10 : null,
          passMark: pass,
        };
      })
      .sort((a, b) => b.heldOn.localeCompare(a.heldOn));

    if (!q.sectionId) return { kind: 'school' as const, summary, groups: groupSummary(summary), grid: null };

    const section = await tx.section.findUnique({ where: { id: q.sectionId }, include: { class: true } });
    if (!section) throw notFound('Section');
    const students = await tx.student.findMany({
      where: { sectionId: section.id, status: 'ACTIVE' },
      include: { user: { select: { displayName: true } } },
      orderBy: { rollNumber: 'asc' },
    });
    const cols = [...assessments].sort((a, b) => a.heldOn.getTime() - b.heldOn.getTime());
    const grid = {
      section: sectionLabel(section),
      columns: cols.map((a) => ({ id: a.id, label: `${a.subject.name} · ${a.name}`, maxMarks: Number(a.maxMarks) })),
      rows: students.map((s) => {
        const cells = cols.map((a) => {
          const m = a.marks.find((x) => x.studentId === s.id);
          if (!m) return null;
          if (m.absent) return 'AB';
          return m.score === null ? null : Number(m.score);
        });
        let got = 0;
        let max = 0;
        cols.forEach((a, i) => {
          const c = cells[i];
          if (typeof c === 'number') {
            got += c;
            max += Number(a.maxMarks);
          }
        });
        const pct = max ? Math.round((got / max) * 1000) / 10 : null;
        const bands = (cols[0]?.gradingScheme.bands as Band[] | undefined) ?? [];
        return {
          id: s.id,
          rollNumber: s.rollNumber,
          name: s.user.displayName,
          cells,
          pct,
          grade: bands.length ? gradeFor(bands, pct) : null,
        };
      }),
    };
    return { kind: 'section' as const, summary, groups: null, grid };
  });
}

type SummaryRow = {
  section: string;
  subject: string;
  name: string;
  heldOn: string;
  status: string;
  entered: number;
  average: number | null;
  highest: number | null;
  lowest: number | null;
  passRate: number | null;
};

/** Whole-school view: one row per test (subject + name) across sections, weighted by marks entered. */
function groupSummary(rows: SummaryRow[]) {
  const by = new Map<string, SummaryRow[]>();
  for (const r of rows) {
    const k = `${r.subject} · ${r.name}`;
    by.set(k, [...(by.get(k) ?? []), r]);
  }
  return [...by.entries()]
    .map(([label, rs]) => {
      const n = rs.reduce((x, r) => x + r.entered, 0);
      const w = (f: (r: SummaryRow) => number | null) =>
        n ? Math.round((rs.reduce((x, r) => x + (f(r) ?? 0) * r.entered, 0) / n) * 10) / 10 : null;
      const highs = rs.map((r) => r.highest).filter((v): v is number => v !== null);
      const lows = rs.map((r) => r.lowest).filter((v): v is number => v !== null);
      const sorted = [...rs].filter((r) => r.average !== null).sort((a, b) => a.average! - b.average!);
      return {
        label,
        heldOn: rs.map((r) => r.heldOn).sort()[0]!,
        sections: rs.length,
        waiting: rs.filter((r) => r.status !== 'PUBLISHED').length,
        entered: n,
        average: w((r) => r.average),
        highest: highs.length ? Math.max(...highs) : null,
        lowest: lows.length ? Math.min(...lows) : null,
        passRate: w((r) => r.passRate),
        weakest: sorted[0] ? { section: sorted[0].section, average: sorted[0].average } : null,
        strongest:
          sorted.length > 1
            ? { section: sorted[sorted.length - 1]!.section, average: sorted[sorted.length - 1]!.average }
            : null,
      };
    })
    .sort((a, b) => b.heldOn.localeCompare(a.heldOn) || a.label.localeCompare(b.label));
}

export function marksCsv(r: Awaited<ReturnType<typeof marksReport>>) {
  if (r.grid) {
    return toCsv(
      ['Roll', 'Student', ...r.grid.columns.map((c) => `${c.label} (/${c.maxMarks})`), 'Overall %', 'Grade'],
      r.grid.rows.map((x) => [x.rollNumber, x.name, ...(x.cells as Cell[]), x.pct, x.grade]),
    );
  }
  return toCsv(
    [
      'Date',
      'Section',
      'Subject',
      'Test',
      'Status',
      'Entered',
      'Absent',
      'Average %',
      'Highest %',
      'Lowest %',
      'Pass rate %',
    ],
    r.summary.map((x) => [
      x.heldOn,
      x.section,
      x.subject,
      x.name,
      x.status === 'PUBLISHED' ? 'Published' : 'Waiting to publish',
      x.entered,
      x.absent,
      x.average,
      x.highest,
      x.lowest,
      x.passRate,
    ]),
  );
}

// ── At risk ──────────────────────────────────────────────────────────────────

export const atRiskQuery = z.object({ format: z.enum(['json', 'csv']).default('json') });

export async function atRiskReport(ctx: AuthedContext) {
  const year = await currentYear(ctx);
  const showGuardian = ctx.user.role === 'SCHOOL_ADMIN';
  return inTenant(ctx, async (tx) => {
    const clock = await schoolClock(tx);
    const counts = await countsByStudent(tx, {
      batch: { date: { gte: year.startsOn }, ...countedPeriods(clock.attendanceMode) },
      student: { status: 'ACTIVE' },
    });
    const risky = [...counts.entries()]
      .map(([id, c]) => ({ id, c, pct: attendancePct(c), days: c.PRESENT + c.LATE + c.ABSENT }))
      .filter((r) => r.pct !== null && r.days >= 10 && r.pct < clock.atRiskThreshold)
      .sort((a, b) => a.pct! - b.pct!);
    const students = await tx.student.findMany({
      where: { id: { in: risky.map((r) => r.id) } },
      include: {
        user: { select: { displayName: true, username: true } },
        section: { include: { class: true, classTeacher: { include: { user: { select: { displayName: true } } } } } },
      },
    });
    const info = new Map(students.map((s) => [s.id, s]));
    const lastAbsent = await tx.$queryRaw<{ student_id: string; last: Date }[]>`
      SELECT r.student_id, MAX(b.date) AS last FROM attendance_records r JOIN attendance_batches b ON b.id = r.batch_id
      WHERE r.status = 'ABSENT' AND b.date >= ${year.startsOn} ${countedPeriodsSql(clock.attendanceMode)}
      GROUP BY r.student_id`;
    const last = new Map(lastAbsent.map((l) => [l.student_id, isoDate(l.last)]));
    return {
      threshold: clock.atRiskThreshold,
      showGuardian,
      rows: risky.map((r) => {
        const s = info.get(r.id)!;
        return {
          id: r.id,
          name: s.user.displayName,
          username: s.user.username,
          section: s.section ? sectionLabel(s.section) : '—',
          incharge: s.section?.classTeacher?.user.displayName ?? null,
          pct: r.pct!,
          absent: r.c.ABSENT,
          late: r.c.LATE,
          lastAbsent: last.get(r.id) ?? null,
          guardianName: showGuardian ? s.guardianName : undefined,
          guardianPhone: showGuardian ? s.guardianPhone : undefined,
        };
      }),
    };
  });
}

export function atRiskCsv(r: Awaited<ReturnType<typeof atRiskReport>>) {
  const header = [
    'Student',
    'Username',
    'Section',
    'Class Incharge',
    'Attendance %',
    'Absent days',
    'Late days',
    'Last absent',
  ];
  if (r.showGuardian) header.push('Guardian', 'Guardian phone');
  return toCsv(
    header,
    r.rows.map((x) => {
      const row: Cell[] = [x.name, x.username, x.section, x.incharge, x.pct, x.absent, x.late, x.lastAbsent];
      if (r.showGuardian) row.push(x.guardianName ?? '', x.guardianPhone ?? '');
      return row;
    }),
  );
}
