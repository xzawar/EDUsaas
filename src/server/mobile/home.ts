import 'server-only';
import type { AuthedContext } from '@/server/http/route';
import { platformOverview } from '@/server/platform/overview';
import { platformHealth } from '@/server/platform/tenants';
import { ticketQueue } from '@/server/platform/tickets';
import { teacherMarksTodo, unpublishedCount } from '@/server/school/assessments';
import {
  attendanceOverview,
  myCheckIn,
  studentAttendance,
  teacherAttendanceTodo,
  teacherBoard,
} from '@/server/school/attendance';
import { inTenant, schoolClock } from '@/server/school/common';
import { admissionsOverview, schoolOverview, studentOverview, teacherOverview } from '@/server/school/dashboard';
import { myFees } from '@/server/school/finance/invoices';
import { financeOverview } from '@/server/school/finance/overview';
import { pendingApprovals } from '@/server/school/leave';
import { myNotifications } from '@/server/school/notifications';
import { todayLessons } from '@/server/school/timetable';
import { listAnnouncements } from '@/server/school/announcements';

/**
 * The app's home payload per role (spec §3.4). Mirrors the web dashboards; every piece is gated by the same
 * permission the web page uses, and anything missing (no year, no record) comes back null instead of failing.
 */
export async function mobileHome(ctx: AuthedContext) {
  const role = ctx.user.role;
  const safe = async <T>(p: Promise<T>): Promise<T | null> => p.catch(() => null);

  if (role === 'PLATFORM_OWNER' || role === 'PLATFORM_ADMIN') {
    const [health, overview, tickets] = await Promise.all([
      platformHealth(),
      ctx.can('platform.plans.manage') ? safe(platformOverview()) : Promise.resolve(null),
      ctx.can('platform.support.queue') ? safe(ticketQueue({ status: 'OPEN' })) : Promise.resolve(null),
    ]);
    return { kind: 'platform' as const, health, overview, openTickets: tickets?.items.length ?? 0 };
  }

  const clock = await inTenant(ctx, (tx) => schoolClock(tx));
  const [announcements, notifications] = await Promise.all([
    safe(listAnnouncements(ctx, { limit: 3 })),
    safe(myNotifications(ctx, 5)),
  ]);
  const base = { today: clock.today, announcements: announcements ?? [], unread: notifications?.unread ?? 0 };

  if (role === 'STUDENT') {
    const me = await inTenant(ctx, (tx) =>
      tx.student.findUnique({ where: { userId: ctx.user.id }, select: { id: true } }),
    );
    const [overview, attendance, lessons, fees] = await Promise.all([
      safe(studentOverview(ctx)),
      me ? safe(studentAttendance(ctx, me.id)) : Promise.resolve(null),
      safe(todayLessons(ctx)),
      safe(myFees(ctx)),
    ]);
    return {
      kind: 'student' as const,
      ...base,
      overview,
      attendance: attendance ? { pct: attendance.pct, counts: attendance.counts } : null,
      lessons,
      fees: fees
        ? {
            outstandingPaisa: fees.outstandingPaisa,
            advancePaisa: fees.advancePaisa,
            openBills: fees.invoices.filter((i) => i.status === 'DUE' || i.status === 'PARTIAL').length,
          }
        : null,
    };
  }

  if (role === 'TEACHER') {
    const [overview, checkin, todo, lessons, approvals, drafts] = await Promise.all([
      safe(teacherOverview(ctx)),
      safe(myCheckIn(ctx)),
      safe(teacherAttendanceTodo(ctx)),
      safe(todayLessons(ctx)),
      pendingApprovals(ctx),
      safe(teacherMarksTodo(ctx)),
    ]);
    return { kind: 'teacher' as const, ...base, overview, checkin, todo, lessons, approvals, drafts };
  }

  if (role === 'ACCOUNTANT') {
    return { kind: 'accountant' as const, ...base, finance: await financeOverview(ctx) };
  }

  if (role === 'ADMISSIONS_OFFICER') {
    const [admissions, school] = await Promise.all([safe(admissionsOverview(ctx)), safe(schoolOverview(ctx))]);
    return {
      kind: 'admissions' as const,
      ...base,
      admissions,
      counts: school?.counts ?? null,
      recentAdmissions: school?.recentAdmissions ?? [],
    };
  }

  // School Admin / Principal
  const [school, att, board, approvals, toPublish, finance] = await Promise.all([
    safe(schoolOverview(ctx)),
    ctx.can('attendance.oversee') ? safe(attendanceOverview(ctx)) : Promise.resolve(null),
    ctx.can('teacher_attendance.oversee') ? safe(teacherBoard(ctx)) : Promise.resolve(null),
    pendingApprovals(ctx),
    role === 'SCHOOL_ADMIN' || ctx.can('marks.manage') ? unpublishedCount(ctx) : Promise.resolve(0),
    ctx.can('finance.read') ? safe(financeOverview(ctx)) : Promise.resolve(null),
  ]);
  return {
    kind: 'school' as const,
    ...base,
    counts: school?.counts ?? null,
    checklist: school?.checklist ?? [],
    attendance: att
      ? {
          todayPct: att.todayPct,
          todayCounts: att.todayCounts,
          sectionsSubmitted: att.sectionsSubmitted,
          sectionsTotal: att.sectionsTotal,
          pending: att.pending,
          atRiskCount: att.atRiskCount,
          trend: att.trend.slice(-14),
        }
      : null,
    teachers: board ? board.summary : null,
    approvals,
    toPublish,
    finance: finance
      ? {
          monthCollectedPaisa: finance.monthCollectedPaisa,
          outstandingPaisa: finance.outstandingPaisa,
          monthExpensesPaisa: finance.monthExpensesPaisa,
          claimsPending: finance.claimsPending,
        }
      : null,
  };
}
