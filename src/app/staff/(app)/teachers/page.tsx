import { Users } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/AppShell';
import { NewTeacherButton } from '@/components/people/TeacherForms';
import { Avatar, Badge, Card, EmptyState, Pager, Table, Td, Th } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { listTeachers, listTeachersQuery } from '@/server/school/people';

export const metadata: Metadata = { title: 'Teachers' };

export default async function TeachersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requirePortal('STAFF', 'teachers.read');
  const sp = await searchParams;
  const parsed = listTeachersQuery.safeParse(sp);
  const query = parsed.success ? parsed.data : listTeachersQuery.parse({});
  const { items, nextCursor } = await listTeachers(ctx, query);
  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: query.q, ...extra })) if (v) p.set(k, v);
    return `/staff/teachers?${p.toString()}`;
  };
  return (
    <>
      <PageHeader
        title="Teachers"
        description="Teachers sign in on the Staff Portal with their username."
        actions={
          ctx.can('teachers.write') ? <NewTeacherButton schoolName={ctx.session.tenant?.name ?? ''} /> : undefined
        }
      />
      <Card>
        <form action="/staff/teachers" className="mb-4">
          <input
            name="q"
            defaultValue={query.q}
            placeholder="Search by name, username or employee no."
            aria-label="Search teachers"
            className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </form>
        {items.length === 0 ? (
          <EmptyState
            icon={<Users className="size-5" />}
            title={query.q ? 'No teachers match that search' : 'No teachers yet'}
            description={query.q ? undefined : 'Add teachers, then assign them to sections and subjects.'}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Teacher</Th>
                <Th className="hidden md:table-cell">Subjects</Th>
                <Th>Class Incharge</Th>
                <Th className="hidden sm:table-cell text-right">Classes</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/staff/teachers/${t.id}`} className="flex items-center gap-3">
                      <Avatar name={t.name} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium hover:text-deep-2">
                          {t.name} {t.status !== 'ACTIVE' && <Badge tone="red">Disabled</Badge>}
                        </span>
                        <span className="block truncate font-mono text-xs text-slate-500">{t.username}</span>
                      </span>
                    </Link>
                  </Td>
                  <Td className="hidden text-slate-600 md:table-cell">
                    {t.subjects.join(', ') || <span className="text-amber-700">Not assigned</span>}
                  </Td>
                  <Td>
                    {t.inchargeOf.length ? (
                      t.inchargeOf.map((s) => (
                        <Badge key={s} tone="green">
                          {s}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </Td>
                  <Td className="hidden text-right tabular-nums sm:table-cell">{t.assignmentCount}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pager
          showing={`${items.length} shown`}
          nextHref={nextCursor ? href({ cursor: nextCursor }) : null}
          firstHref={query.cursor ? href({ cursor: undefined }) : null}
        />
      </Card>
    </>
  );
}
