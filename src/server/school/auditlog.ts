import 'server-only';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { AuthedContext } from '@/server/http/route';
import { inTenant } from '@/server/school/common';

/** Audit-log viewer (spec §8.12): the school's own trail, newest first, filterable. Read-only by construction. */

export const AUDIT_CATEGORIES = {
  auth: 'Sign-ins & passwords',
  student: 'Students',
  teacher: 'Teachers & staff',
  attendance: 'Attendance',
  teacher_attendance: 'Teacher check-ins',
  leave: 'Leave',
  marks: 'Tests & marks',
  remark: 'Remarks',
  timetable: 'Timetable',
  structure: 'Classes & years',
  settings: 'Settings & permissions',
  import: 'Imports',
  announcement: 'Announcements',
  access: 'Blocked access',
  support: 'EDUsaas support',
  finance: 'Fees & money',
} as const;

const PREFIXES: Record<keyof typeof AUDIT_CATEGORIES, string[]> = {
  auth: ['auth.', 'user.reset_password', 'password.'],
  student: ['student.', 'promotion.', 'section.renumber', 'archive.'],
  teacher: ['teacher.', 'staff.', 'user.'],
  attendance: ['attendance.'],
  teacher_attendance: ['teacher_attendance.'],
  leave: ['leave.', 'leave_type.'],
  marks: ['assessment.', 'marks.', 'grading.'],
  remark: ['remark.'],
  timetable: ['timetable.'],
  structure: ['year.', 'class.', 'section.', 'subject.'],
  settings: ['settings.', 'permissions.'],
  import: ['import.'],
  announcement: ['announcement.'],
  access: ['access.'],
  support: ['support.', 'tenant.', 'ticket.', 'subscription.'],
  finance: [
    'fee_head.',
    'fee_structure.',
    'fee_override.',
    'late_fee.',
    'discount.',
    'invoice.',
    'payment.',
    'claim.',
    'expense.',
    'expense_category.',
    'salary.',
    'payroll.',
  ],
};

export const auditQuery = z.object({
  category: z
    .enum(Object.keys(AUDIT_CATEGORIES) as [keyof typeof AUDIT_CATEGORIES, ...(keyof typeof AUDIT_CATEGORIES)[]])
    .optional(),
  actorId: z.string().uuid().optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  outcome: z.enum(['success', 'denied']).optional(),
  /** Sign-ins are frequent; they're hidden unless asked for (or the "Sign-ins & passwords" category is chosen). */
  signins: z.enum(['1']).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function listAuditLogs(ctx: AuthedContext, q: z.infer<typeof auditQuery>) {
  return inTenant(ctx, async (tx) => {
    const where: Prisma.AuditLogWhereInput = {
      ...(q.category
        ? { OR: PREFIXES[q.category].map((p) => (p.endsWith('.') ? { action: { startsWith: p } } : { action: p })) }
        : {}),
      ...(!q.category && !q.signins && q.outcome !== 'denied'
        ? { action: { notIn: ['auth.login', 'auth.logout'] } }
        : {}),
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.outcome ? { outcome: q.outcome } : {}),
      ...(q.from || q.to
        ? {
            createdAt: {
              ...(q.from ? { gte: new Date(`${q.from}T00:00:00+05:00`) } : {}),
              ...(q.to ? { lt: new Date(new Date(`${q.to}T00:00:00+05:00`).getTime() + 86400_000) } : {}),
            },
          }
        : {}),
    };
    const rows = await tx.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, q.limit);
    const actorIds = [...new Set(page.map((r) => r.actorId).filter(Boolean))] as string[];
    const actors = new Map(
      (await tx.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, displayName: true } })).map(
        (u) => [u.id, u.displayName],
      ),
    );
    return {
      items: page.map((r) => ({
        id: r.id,
        at: r.createdAt,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        outcome: r.outcome,
        actor: r.actorId ? (actors.get(r.actorId) ?? 'Removed user') : 'System',
        actorRole: r.actorRole,
        before: r.before,
        after: r.after,
        metadata: r.metadata,
        support: !!r.supportGrantId,
      })),
      nextCursor: rows.length > q.limit ? page[page.length - 1]!.id : null,
    };
  });
}

/** People who appear as actors (for the "who" filter). */
export async function auditActors(ctx: AuthedContext) {
  return inTenant(ctx, (tx) =>
    tx.user.findMany({
      where: { role: { not: 'STUDENT' }, deletedAt: null },
      select: { id: true, displayName: true, role: true },
      orderBy: { displayName: 'asc' },
      take: 300,
    }),
  );
}
