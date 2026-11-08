import { Eye } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/AppShell';
import { Alert, Card, Stat, ROLE_LABELS } from '@/components/ui';
import { actionLabel } from '@/lib/audit-labels';
import { requirePortal } from '@/server/auth/page';
import { AppError } from '@/server/http/errors';
import { supportView } from '@/server/platform/support';

export const metadata: Metadata = { title: 'Support view' };

const fmt = (d: Date) =>
  d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Karachi',
  });

/** Read-only, time-boxed, audited. Shows what's needed to troubleshoot — no student records. */
export default async function SupportViewPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePortal('PLATFORM', 'platform.tenants.manage');
  const { id } = await params;
  const back = (
    <Link href={`/platform/tenants/${id}`} className="hover:underline">
      ← School
    </Link>
  );
  let v: Awaited<ReturnType<typeof supportView>>;
  try {
    v = await supportView(ctx, id);
  } catch (e) {
    if (e instanceof AppError) {
      return (
        <>
          <PageHeader title="Support view" breadcrumb={back} />
          <Alert tone="warning">{e.message}</Alert>
        </>
      );
    }
    throw e;
  }
  return (
    <>
      <PageHeader
        title="Support view"
        breadcrumb={back}
        description={`Read-only · ends ${fmt(v.grant.expiresAt)} · reason: ${v.grant.reason}`}
      />
      <Alert tone="info">
        <Eye className="mr-1 inline size-4" aria-hidden /> The school can see that you opened this page, and when.
      </Alert>
      <div className="my-6 grid gap-4 sm:grid-cols-4">
        <Stat label="Academic year" value={v.year ?? '—'} />
        <Stat label="Active students" value={v.students} />
        <Stat label="Teachers" value={v.teachers} />
        <Stat label="Sections" value={v.sections} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Office accounts">
          <ul className="divide-y divide-slate-100 text-sm">
            {v.staff.map((u, i) => (
              <li key={i} className="flex justify-between py-2">
                <span>
                  {u.displayName} <span className="text-slate-500">· {ROLE_LABELS[u.role]}</span>
                </span>
                <span className="text-slate-500">
                  {u.status === 'ACTIVE'
                    ? u.lastLoginAt
                      ? `last in ${fmt(u.lastLoginAt)}`
                      : 'never signed in'
                    : u.status.toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Recent activity" description="Actions only — no names of students.">
          <ul className="divide-y divide-slate-100 text-sm">
            {v.recent.map((a, i) => (
              <li key={i} className="flex justify-between gap-3 py-1.5">
                <span>
                  {actionLabel(a.action)}
                  {a.outcome !== 'success' && <span className="ml-1 text-red-700">({a.outcome})</span>}
                  {a.actorRole && <span className="text-slate-500"> · {ROLE_LABELS[a.actorRole]}</span>}
                </span>
                <span className="shrink-0 text-slate-500">{fmt(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
        {v.settings && (
          <Card title="Settings">
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-slate-500">Time zone</dt>
              <dd>{v.settings.timezone}</dd>
              <dt className="text-slate-500">At-risk below</dt>
              <dd>{v.settings.atRiskThreshold}%</dd>
              <dt className="text-slate-500">Marks published by</dt>
              <dd>{v.settings.marksPublisher === 'PRINCIPAL' ? 'Principal' : 'School Admin'}</dd>
              <dt className="text-slate-500">Leave escalates after</dt>
              <dd>{v.settings.leaveAgeOutHours} h</dd>
            </dl>
          </Card>
        )}
      </div>
    </>
  );
}
