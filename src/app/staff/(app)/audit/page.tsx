import { ShieldAlert } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/AppShell';
import { Badge, Card, EmptyState, ROLE_LABELS } from '@/components/ui';
import { actionLabel } from '@/lib/audit-labels';
import { requirePortal } from '@/server/auth/page';
import { auditArchiveList } from '@/server/audit/archives';
import { AUDIT_CATEGORIES, auditActors, auditQuery, listAuditLogs } from '@/server/school/auditlog';

export const metadata: Metadata = { title: 'Audit log' };

type SP = Record<string, string | undefined>;

function Details({ value }: { value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <pre className="overflow-x-auto rounded-md bg-slate-50 p-2 text-xs whitespace-pre-wrap text-slate-700">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePortal('STAFF', 'audit.read');
  const sp = await searchParams;
  const parsed = auditQuery.safeParse(Object.fromEntries(Object.entries(sp).filter(([, v]) => v)));
  const q = parsed.success ? parsed.data : auditQuery.parse({});
  const [{ items, nextCursor }, actors, archived] = await Promise.all([
    listAuditLogs(ctx, q),
    auditActors(ctx),
    auditArchiveList(ctx),
  ]);
  const keep = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== 'cursor') as [string, string][]);
  const olderHref = nextCursor
    ? `/staff/audit?${new URLSearchParams([...keep.entries(), ['cursor', nextCursor]]).toString()}`
    : null;
  const filtered = [...keep.keys()].length > 0;

  const day = (d: Date) =>
    d.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Karachi',
    });
  const time = (d: Date) =>
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Karachi' });
  let lastDay = '';

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every important change in your school: who did it, and when. Entries can’t be edited or deleted."
      />
      <Card>
        <form className="mb-4 flex flex-wrap items-end gap-3" action="/staff/audit">
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">What</span>
            <select
              name="category"
              defaultValue={q.category ?? ''}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm"
            >
              <option value="">Everything</option>
              {Object.entries(AUDIT_CATEGORIES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Who</span>
            <select
              name="actorId"
              defaultValue={q.actorId ?? ''}
              className="h-9 max-w-56 rounded-lg border border-slate-300 bg-white px-2 text-sm"
            >
              <option value="">Anyone</option>
              {actors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.displayName} ({ROLE_LABELS[a.role]})
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">From</span>
            <input
              type="date"
              name="from"
              defaultValue={q.from ?? ''}
              className="h-9 rounded-lg border border-slate-300 px-2 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">To</span>
            <input
              type="date"
              name="to"
              defaultValue={q.to ?? ''}
              className="h-9 rounded-lg border border-slate-300 px-2 text-sm"
            />
          </label>
          <label className="flex h-9 items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="outcome"
              value="denied"
              defaultChecked={q.outcome === 'denied'}
              className="size-4 rounded border-slate-300"
            />
            Blocked only
          </label>
          <label className="flex h-9 items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="signins"
              value="1"
              defaultChecked={q.signins === '1'}
              className="size-4 rounded border-slate-300"
            />
            Include sign-ins
          </label>
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-full bg-white px-5 text-[15px] font-semibold text-primary ring-1 ring-line hover:bg-tint-strong"
          >
            Filter
          </button>
          {filtered && (
            <Link href="/staff/audit" className="h-9 px-2 text-sm leading-9 text-slate-600 hover:underline">
              Clear
            </Link>
          )}
        </form>

        {items.length === 0 ? (
          <EmptyState title="Nothing found" description="Try a wider date range or another filter." />
        ) : (
          <ol className="divide-y divide-slate-100">
            {items.map((e) => {
              const d = day(e.at);
              const header = d !== lastDay ? d : null;
              lastDay = d;
              const hasDetails = e.before !== null || e.after !== null || e.metadata !== null;
              return (
                <li key={e.id}>
                  {header && <p className="bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-500">{header}</p>}
                  <details className="group px-2 py-2.5">
                    <summary
                      className={
                        hasDetails
                          ? 'flex cursor-pointer list-none items-start gap-3'
                          : 'flex list-none items-start gap-3'
                      }
                    >
                      <span className="w-12 shrink-0 pt-0.5 text-xs text-slate-500 tabular-nums">{time(e.at)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                          {e.outcome === 'denied' && (
                            <ShieldAlert className="size-4 text-red-600" aria-label="Blocked" />
                          )}
                          {e.action === 'auth.login' && e.outcome === 'denied'
                            ? 'Failed sign-in'
                            : actionLabel(e.action)}
                          {e.outcome === 'denied' && <Badge tone="red">Blocked</Badge>}
                          {e.support && <Badge tone="amber">Support access</Badge>}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {e.actor}
                          {e.actorRole && ` · ${ROLE_LABELS[e.actorRole]}`}
                        </span>
                      </span>
                      {hasDetails && <span className="text-xs text-slate-400 group-open:hidden">Details</span>}
                    </summary>
                    {hasDetails && (
                      <div className="mt-2 grid gap-2 pl-15 sm:grid-cols-2">
                        {e.before !== null && (
                          <div>
                            <p className="mb-1 text-xs font-medium text-slate-500">Before</p>
                            <Details value={e.before} />
                          </div>
                        )}
                        {e.after !== null && (
                          <div>
                            <p className="mb-1 text-xs font-medium text-slate-500">After</p>
                            <Details value={e.after} />
                          </div>
                        )}
                        {e.metadata !== null && (
                          <div className="sm:col-span-2">
                            <p className="mb-1 text-xs font-medium text-slate-500">Details</p>
                            <Details value={e.metadata} />
                          </div>
                        )}
                      </div>
                    )}
                  </details>
                </li>
              );
            })}
          </ol>
        )}
        {olderHref && (
          <div className="mt-4 text-center">
            <Link href={olderHref} className="text-sm font-medium text-link hover:underline">
              Show older →
            </Link>
          </div>
        )}
      </Card>
      {archived.length > 0 && (
        <Card
          className="mt-6"
          title="Archived months"
          description="Finished months are moved to secure file storage. Download one to search it."
        >
          <ul className="flex flex-wrap gap-2">
            {archived.map((a) => (
              <li key={a.month}>
                <a
                  href={`/api/v1/audit-logs/archives/${a.month}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-1.5 text-sm font-medium ring-1 ring-slate-200 hover:bg-white"
                >
                  {a.month} <span className="text-xs text-slate-500">· {a.rows} entries</span>
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
