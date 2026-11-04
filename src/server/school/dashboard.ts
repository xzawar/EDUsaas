import 'server-only';
import type { AuthedContext } from '@/server/http/route';
import { inTenant, sectionLabel, teacherScope } from '@/server/school/common';

/** School overview for School Admin / Principal / Admissions Officer (fields gated by permission). */
export async function schoolOverview(ctx: AuthedContext) {
  return inTenant(ctx, async (tx) => {
    const year = await tx.academicYear.findFirst({ where: { status: 'CURRENT' } });
    const inYear = year ? { class: { academicYearId: year.id } } : { id: '00000000-0000-0000-0000-000000000000' };

    const [students, teachers, subjects, sections, genders, recentAdmissions, activity, staffCounts] =
      await Promise.all([
        tx.student.count({ where: { status: 'ACTIVE' } }),
        tx.teacher.count({ where: { user: { status: 'ACTIVE' } } }),
        tx.subject.count({ where: { archivedAt: null } }),
        tx.section.findMany({
          where: inYear,
          include: {
            class: { select: { name: true, gradeLevel: true } },
            classTeacher: { select: { id: true } },
            _count: { select: { students: { where: { status: 'ACTIVE' } }, assignments: true } },
          },
        }),
        tx.student.groupBy({ by: ['gender'], where: { status: 'ACTIVE' }, _count: { _all: true } }),
        tx.student.findMany({
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          take: 6,
          include: {
            user: { select: { displayName: true, username: true } },
            section: { include: { class: { select: { name: true } } } },
          },
        }),
        ctx.can('audit.read')
          ? tx.auditLog.findMany({
              orderBy: { createdAt: 'desc' },
              take: 8,
              select: { id: true, action: true, entity: true, createdAt: true, actorRole: true, outcome: true },
            })
          : Promise.resolve(null),
        tx.user.groupBy({
          by: ['role'],
          where: { deletedAt: null, status: 'ACTIVE', role: { in: ['PRINCIPAL', 'ADMISSIONS_OFFICER'] } },
          _count: { _all: true },
        }),
      ]);

    const unplaced = await tx.student.count({ where: { status: 'ACTIVE', sectionId: null } });
    const byClass = new Map<
      string,
      { name: string; gradeLevel: number; students: number; capacity: number | null; sections: number }
    >();
    for (const s of sections) {
      const c = byClass.get(s.class.name) ?? {
        name: s.class.name,
        gradeLevel: s.class.gradeLevel,
        students: 0,
        capacity: 0,
        sections: 0,
      };
      c.students += s._count.students;
      c.sections += 1;
      c.capacity = c.capacity === null || s.capacity === null ? null : c.capacity + s.capacity;
      byClass.set(s.class.name, c);
    }
    const sectionsWithoutIncharge = sections.filter((s) => !s.classTeacher).map(sectionLabel);
    const sectionsWithoutTeachers = sections.filter((s) => s._count.assignments === 0).map(sectionLabel);
    const nearlyFull = sections
      .filter((s) => s.capacity && s._count.students / s.capacity >= 0.9)
      .map((s) => ({ label: sectionLabel(s), students: s._count.students, capacity: s.capacity! }));

    const checklist = [
      { key: 'year', label: 'Create the current academic year', done: !!year, href: '/staff/academics' },
      { key: 'subjects', label: 'Add subjects', done: subjects > 0, href: '/staff/subjects' },
      { key: 'classes', label: 'Add classes and sections', done: sections.length > 0, href: '/staff/academics' },
      { key: 'teachers', label: 'Add teachers', done: teachers > 0, href: '/staff/teachers' },
      {
        key: 'assign',
        label: 'Assign teachers to sections and subjects',
        done: sections.length > 0 && sectionsWithoutTeachers.length === 0,
        href: '/staff/teachers',
      },
      {
        key: 'incharge',
        label: 'Choose a Class Incharge for every section',
        done: sections.length > 0 && sectionsWithoutIncharge.length === 0,
        href: '/staff/academics',
      },
      { key: 'students', label: 'Admit students', done: students > 0, href: '/staff/students' },
    ];

    return {
      year: year ? { id: year.id, name: year.name } : null,
      counts: {
        students,
        teachers,
        subjects,
        sections: sections.length,
        classes: byClass.size,
        unplaced,
        principals: staffCounts.find((s) => s.role === 'PRINCIPAL')?._count._all ?? 0,
        admissions: staffCounts.find((s) => s.role === 'ADMISSIONS_OFFICER')?._count._all ?? 0,
      },
      genders: Object.fromEntries(genders.map((g) => [g.gender ?? 'UNSPECIFIED', g._count._all])) as Record<
        string,
        number
      >,
      classes: [...byClass.values()].sort((a, b) => a.gradeLevel - b.gradeLevel),
      sectionsWithoutIncharge,
      sectionsWithoutTeachers,
      nearlyFull,
      checklist,
      recentAdmissions: recentAdmissions.map((s) => ({
        id: s.id,
        name: s.user.displayName,
        username: s.user.username,
        section: s.section ? sectionLabel(s.section) : 'Unplaced',
        createdAt: s.createdAt,
      })),
      activity,
    };
  });
}

/** Teacher "Today" view: what they teach and the section they're in charge of. */
export async function teacherOverview(ctx: AuthedContext) {
  return inTenant(ctx, async (tx) => {
    const scope = await teacherScope(tx, ctx.user.id);
    if (!scope.teacherId) return null;
    const sections = await tx.section.findMany({
      where: { id: { in: scope.sectionIds }, class: { academicYear: { status: 'CURRENT' } } },
      include: {
        class: { select: { name: true, gradeLevel: true } },
        _count: { select: { students: { where: { status: 'ACTIVE' } } } },
        assignments: { where: { teacherId: scope.teacherId }, include: { subject: { select: { name: true } } } },
      },
    });
    const list = sections
      .sort((a, b) => a.class.gradeLevel - b.class.gradeLevel || a.name.localeCompare(b.name))
      .map((s) => ({
        id: s.id,
        label: sectionLabel(s),
        students: s._count.students,
        subjects: s.assignments.map((a) => a.subject.name).sort(),
        isIncharge: scope.inchargeSectionIds.includes(s.id),
      }));
    return {
      sections: list,
      incharge: list.filter((s) => s.isIncharge),
      totalStudents: list.reduce((n, s) => n + s.students, 0),
      subjectCount: new Set(list.flatMap((s) => s.subjects)).size,
    };
  });
}

/** Student home: own placement, class teacher and subjects. */
export async function studentOverview(ctx: AuthedContext) {
  return inTenant(ctx, async (tx) => {
    const s = await tx.student.findUnique({
      where: { userId: ctx.user.id },
      include: {
        section: {
          include: {
            class: {
              include: {
                academicYear: { select: { name: true } },
                subjects: { include: { subject: { select: { name: true } } } },
              },
            },
            classTeacher: { include: { user: { select: { displayName: true } } } },
            assignments: {
              include: {
                subject: { select: { name: true } },
                teacher: { include: { user: { select: { displayName: true } } } },
              },
            },
            _count: { select: { students: { where: { status: 'ACTIVE' } } } },
          },
        },
      },
    });
    if (!s) return null;
    const teacherBySubject = new Map(
      s.section?.assignments.map((a) => [a.subject.name, a.teacher.user.displayName]) ?? [],
    );
    return {
      rollNumber: s.rollNumber,
      admissionNo: s.admissionNo,
      section: s.section ? sectionLabel(s.section) : null,
      year: s.section?.class.academicYear.name ?? null,
      classTeacher: s.section?.classTeacher?.user.displayName ?? null,
      classmates: s.section ? s.section._count.students - 1 : 0,
      subjects: (s.section?.class.subjects ?? [])
        .map((cs) => ({ name: cs.subject.name, teacher: teacherBySubject.get(cs.subject.name) ?? null }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
}
