import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/AppShell';
import { Card, ROLE_LABELS, Stat } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { PERMISSIONS } from '@/server/authz/permissions';
import { schoolUserCounts } from '@/server/school/users';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function StaffDashboard() {
  const ctx = await requirePortal('STAFF');
  const counts = ctx.can('users.read') ? await schoolUserCounts(ctx) : null;
  const perms = [...ctx.permissions].sort();
  return (
    <>
      <PageHeader
        title={`Welcome, ${ctx.user.displayName.split(' ')[0]}`}
        description={`${ROLE_LABELS[ctx.user.role]} · ${ctx.session.tenant?.name ?? ''}`}
      />
      {counts && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Stat label="Students" value={counts.STUDENT ?? 0} />
          <Stat label="Teachers" value={counts.TEACHER ?? 0} />
          <Stat
            label="Office staff"
            value={(counts.SCHOOL_ADMIN ?? 0) + (counts.PRINCIPAL ?? 0) + (counts.ADMISSIONS_OFFICER ?? 0)}
            hint="Admin, principal and admissions"
          />
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {ctx.user.role === 'SCHOOL_ADMIN' && (
          <Card title="Getting started" description="Set your school up in a few steps.">
            <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
              <li>
                <Link className="font-medium text-[var(--accent)] hover:underline" href="/staff/settings">
                  Check school settings
                </Link>{' '}
                (timezone, attendance mode, at-risk threshold).
              </li>
              <li>
                <Link className="font-medium text-[var(--accent)] hover:underline" href="/staff/settings#permissions">
                  Decide what the Principal and Admissions Officer can do
                </Link>
                .
              </li>
              <li className="text-slate-500">
                Academic year, classes, teachers and students arrive in the next release.
              </li>
            </ol>
          </Card>
        )}
        <Card title="Your access" description="What your account can do at this school.">
          <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
            {perms.map((p) => (
              <li key={p} className="flex items-start gap-2 text-slate-700">
                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                {PERMISSIONS[p]}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
