import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/AppShell';
import { ImportWizard } from '@/components/people/ImportWizard';
import { Badge, ButtonLink, Card, EmptyState, Table, Td, Th } from '@/components/ui';
import { Layers } from 'lucide-react';
import { requirePortal } from '@/server/auth/page';
import { recentImports } from '@/server/school/imports';
import { listSections } from '@/server/school/structure';

export const metadata: Metadata = { title: 'Import students' };

const STATUS = {
  QUEUED: { label: 'Not imported', tone: 'slate' },
  RUNNING: { label: 'Partly imported', tone: 'amber' },
  SUCCEEDED: { label: 'Imported', tone: 'green' },
  FAILED: { label: 'Failed', tone: 'red' },
} as const;

export default async function ImportPage() {
  const ctx = await requirePortal('STAFF', 'students.import');
  const [recent, sections] = await Promise.all([recentImports(ctx), listSections(ctx)]);
  return (
    <>
      <PageHeader
        title="Import students"
        breadcrumb={
          <Link href="/staff/students" className="hover:underline">
            ← Students
          </Link>
        }
        description="Add many students at once from Excel. Usernames, roll numbers and first-time passwords are created for you."
      />
      <div className="space-y-6">
        {sections.length ? (
          <ImportWizard schoolName={ctx.session.tenant?.name ?? ''} />
        ) : (
          <Card>
            <EmptyState
              icon={<Layers className="size-5" />}
              title="Add classes and sections first"
              description="Each row in the file names a class and section, so those need to exist before you import."
              action={
                ctx.can('structure.manage') ? (
                  <ButtonLink href="/staff/academics">Set up classes</ButtonLink>
                ) : undefined
              }
            />
          </Card>
        )}
        {recent.length > 0 && (
          <Card title="Recent imports">
            <Table>
              <thead>
                <tr>
                  <Th>File</Th>
                  <Th>When</Th>
                  <Th>Rows</Th>
                  <Th>Added</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => {
                  const st = STATUS[r.status as keyof typeof STATUS] ?? STATUS.QUEUED;
                  return (
                    <tr key={r.id}>
                      <Td className="max-w-56 truncate font-medium">{r.fileName}</Td>
                      <Td className="text-slate-600">
                        {r.createdAt.toLocaleString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: 'Asia/Karachi',
                        })}
                      </Td>
                      <Td className="tabular-nums">{r.total}</Td>
                      <Td className="tabular-nums">{r.created}</Td>
                      <Td>
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        )}
      </div>
    </>
  );
}
