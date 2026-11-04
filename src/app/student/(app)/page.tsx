import type { Metadata } from 'next';
import { PageHeader } from '@/components/AppShell';
import { Card } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';

export const metadata: Metadata = { title: 'Home' };

export default async function StudentHome() {
  const ctx = await requirePortal('STUDENT');
  return (
    <>
      <PageHeader title={`Hello, ${ctx.user.displayName.split(' ')[0]}`} description={ctx.session.tenant?.name} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Your account">
          <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-500">Username</dt>
            <dd className="font-mono">{ctx.user.username}</dd>
            <dt className="text-slate-500">School</dt>
            <dd>{ctx.session.tenant?.name}</dd>
          </dl>
          <p className="mt-4 text-xs text-slate-500">
            Your username changes when you move to a new class. If you can&apos;t sign in, ask your school office for
            your current username.
          </p>
        </Card>
        <Card title="Attendance, marks and timetable">
          <p className="text-sm text-slate-600">
            Your attendance, published marks, remarks and timetable will appear here once your school starts recording
            them.
          </p>
        </Card>
      </div>
    </>
  );
}
