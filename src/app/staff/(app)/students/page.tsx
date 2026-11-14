import { GraduationCap, Upload } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/AppShell';
import { NewStudentButton } from '@/components/people/StudentForm';
import { StudentFilters } from '@/components/people/StudentFilters';
import {
  Avatar,
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  Pager,
  TabLinks,
  Table,
  Td,
  Th,
  formatPhone,
} from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { listStudents, listStudentsQuery } from '@/server/school/people';
import { listSections } from '@/server/school/structure';

export const metadata: Metadata = { title: 'Students' };

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requirePortal('STAFF', 'students.search');
  const sp = await searchParams;
  const parsed = listStudentsQuery.safeParse(sp);
  const query = parsed.success ? parsed.data : listStudentsQuery.parse({});
  const isTeacher = ctx.user.role === 'TEACHER';
  const [result, allSections] = await Promise.all([listStudents(ctx, query), listSections(ctx)]);
  const sections = isTeacher
    ? allSections.filter((s) => result.items.some((i) => i.sectionId === s.id) || s.id === query.sectionId)
    : allSections;
  const canWrite = ctx.can('students.write');
  const activeSection = sections.find((s) => s.id === query.sectionId);

  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: query.q, sectionId: query.sectionId, status: query.status, ...extra }))
      if (v) p.set(k, v);
    return `/staff/students?${p.toString()}`;
  };

  return (
    <>
      <PageHeader
        title={isTeacher ? 'My students' : 'Students'}
        description={
          isTeacher
            ? 'Students in the sections you teach or are in charge of.'
            : `${result.total.toLocaleString()} ${query.status.toLowerCase()} student${result.total === 1 ? '' : 's'}${activeSection ? ` in ${activeSection.label}` : ''}`
        }
        actions={
          canWrite || ctx.can('students.import') ? (
            <>
              {ctx.can('students.import') && (
                <ButtonLink href="/staff/students/import" variant="secondary">
                  <Upload className="size-4" /> Import from Excel
                </ButtonLink>
              )}
              {canWrite && (
                <NewStudentButton
                  sections={allSections}
                  schoolName={ctx.session.tenant?.name ?? ''}
                  defaultSectionId={query.sectionId}
                />
              )}
            </>
          ) : undefined
        }
      />
      <Card>
        {!isTeacher && (
          <div className="mb-4">
            <TabLinks
              active={query.status}
              tabs={[
                { key: 'ACTIVE', label: 'Active', href: href({ status: 'ACTIVE', cursor: undefined }) },
                { key: 'WITHDRAWN', label: 'Withdrawn', href: href({ status: 'WITHDRAWN', cursor: undefined }) },
                { key: 'GRADUATED', label: 'Graduated', href: href({ status: 'GRADUATED', cursor: undefined }) },
              ]}
            />
          </div>
        )}
        <StudentFilters sections={sections} />
        {result.items.length === 0 ? (
          <EmptyState
            icon={<GraduationCap className="size-5" />}
            title={query.q ? 'No students match that search' : 'No students here yet'}
            description={
              query.q
                ? 'Try part of the name, the username, or the admission number.'
                : canWrite
                  ? 'Admit your first student to get started.'
                  : undefined
            }
          />
        ) : (
          <Table className="mt-4">
            <thead>
              <tr>
                <Th>Student</Th>
                <Th>Class</Th>
                <Th className="text-right">Roll</Th>
                <Th className="hidden md:table-cell">Guardian</Th>
                <Th className="hidden lg:table-cell">Admission no.</Th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/staff/students/${s.id}`} className="flex items-center gap-3">
                      <Avatar
                        name={s.name}
                        size="sm"
                        src={s.photoVersion ? `/api/v1/students/${s.id}/photo?v=${s.photoVersion}` : null}
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-900 hover:text-deep-2">{s.name}</span>
                        <span className="block truncate font-mono text-xs text-slate-500">{s.username}</span>
                      </span>
                    </Link>
                  </Td>
                  <Td>
                    <Badge>{s.section}</Badge>
                  </Td>
                  <Td className="text-right tabular-nums">{s.rollNumber ?? '—'}</Td>
                  <Td className="hidden md:table-cell">
                    {s.guardianName ? (
                      <>
                        <span className="block">{s.guardianName}</span>
                        <span className="block text-xs text-slate-500">{formatPhone(s.guardianPhone)}</span>
                      </>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </Td>
                  <Td className="hidden text-slate-600 lg:table-cell">{s.admissionNo ?? '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pager
          showing={`Showing ${result.items.length} of ${result.total.toLocaleString()}`}
          nextHref={result.nextCursor ? href({ cursor: result.nextCursor }) : null}
          firstHref={query.cursor ? href({ cursor: undefined }) : null}
        />
      </Card>
    </>
  );
}
