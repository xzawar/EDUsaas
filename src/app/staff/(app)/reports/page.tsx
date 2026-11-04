import { Download } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/AppShell';
import { BarList } from '@/components/charts';
import { Badge, Card, EmptyState, Stat, TabLinks, Table, Td, Th, cx, formatPhone } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { atRiskReport, attendanceReport, marksReport } from '@/server/school/reports';
import { listSections } from '@/server/school/structure';

export const metadata: Metadata = { title: 'Reports' };

type SP = { tab?: string; sectionId?: string; from?: string; to?: string };
const pctText = (v: number | null) => (v === null ? '—' : `${v}%`);
const isUuid = (v?: string) => !!v && /^[0-9a-f-]{36}$/i.test(v);
const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

function DownloadLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
    >
      <Download className="size-4" /> Download CSV
    </a>
  );
}

function qs(params: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  return p.toString();
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePortal('STAFF', 'reports.read');
  const sp = await searchParams;
  const tab = sp.tab === 'marks' || sp.tab === 'at-risk' ? sp.tab : 'attendance';
  const sectionId = isUuid(sp.sectionId) ? sp.sectionId : undefined;
  const sections = await listSections(ctx);

  const filters = (withDates: boolean, from?: string, to?: string) => (
    <form className="mb-4 flex flex-wrap items-end gap-3" action="/staff/reports">
      <input type="hidden" name="tab" value={tab} />
      <label className="text-sm">
        <span className="mb-1 block text-xs font-medium text-slate-600">Section</span>
        <select
          name="sectionId"
          defaultValue={sectionId ?? ''}
          className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm"
        >
          <option value="">Whole school</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      {withDates && (
        <>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">From</span>
            <input
              type="date"
              name="from"
              defaultValue={from ?? ''}
              className="h-9 rounded-lg border border-slate-300 px-2 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">To</span>
            <input
              type="date"
              name="to"
              defaultValue={to ?? ''}
              className="h-9 rounded-lg border border-slate-300 px-2 text-sm"
            />
          </label>
        </>
      )}
      <button
        type="submit"
        className="h-9 rounded-lg bg-[var(--accent)] px-4 text-sm font-medium text-white hover:brightness-110"
      >
        Show
      </button>
    </form>
  );

  return (
    <>
      <PageHeader
        title="Reports"
        description="Attendance, marks and students who need attention. Download any report as CSV for Excel."
      />
      <Card>
        <div className="mb-4">
          <TabLinks
            active={tab}
            tabs={[
              { key: 'attendance', label: 'Attendance', href: '/staff/reports' },
              { key: 'marks', label: 'Marks', href: '/staff/reports?tab=marks' },
              { key: 'at-risk', label: 'At risk', href: '/staff/reports?tab=at-risk' },
            ]}
          />
        </div>
        {tab === 'attendance' && (
          <AttendanceTab sp={sp} sectionId={sectionId} filters={(from, to) => filters(true, from, to)} />
        )}
        {tab === 'marks' && <MarksTab sectionId={sectionId} filters={filters(false)} />}
        {tab === 'at-risk' && <AtRiskTab />}
      </Card>
    </>
  );
}

async function AttendanceTab({
  sp,
  sectionId,
  filters,
}: {
  sp: SP;
  sectionId?: string;
  filters: (from: string, to: string) => React.ReactNode;
}) {
  const ctx = await requirePortal('STAFF', 'reports.read');
  const r = await attendanceReport(ctx, {
    sectionId,
    from: isDate(sp.from) ? sp.from : undefined,
    to: isDate(sp.to) ? sp.to : undefined,
    format: 'json',
  });
  const csv = `/api/v1/reports/attendance?${qs({ sectionId, from: r.from, to: r.to, format: 'csv' })}`;
  const range = `${new Date(`${r.from}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })} – ${new Date(`${r.to}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`;
  return (
    <>
      {filters(r.from, r.to)}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {r.kind === 'section' ? r.section.label : 'All sections'} · {range}
        </p>
        <DownloadLink href={csv} />
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Attendance" value={pctText(r.overallPct)} hint="Present + late ÷ school days" />
        {r.kind === 'section' ? (
          <>
            <Stat label="Registers taken" value={r.registers} />
            <Stat
              label={`Below ${r.threshold}%`}
              value={r.rows.filter((x) => x.pct !== null && x.pct < r.threshold).length}
              hint="students"
            />
          </>
        ) : (
          <>
            <Stat label="Registers taken" value={r.rows.reduce((x, y) => x + y.registers, 0).toLocaleString()} />
            <Stat label={`Below ${r.threshold}%`} value={r.rows.reduce((x, y) => x + y.below, 0)} hint="students" />
          </>
        )}
      </div>
      {r.kind === 'school' ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="mb-2 text-sm font-medium">Attendance by section (%)</p>
            <BarList
              caption="Attendance percentage by section"
              max={100}
              unit="%"
              rows={r.rows.filter((x) => x.pct !== null).map((x) => ({ label: x.label, value: x.pct! }))}
            />
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Section</Th>
                <Th className="text-right">Registers</Th>
                <Th className="text-right">Attendance</Th>
                <Th className="text-right">Below {r.threshold}%</Th>
              </tr>
            </thead>
            <tbody>
              {r.rows.map((x) => (
                <tr key={x.id}>
                  <Td>
                    <Link
                      href={`/staff/reports?${qs({ sectionId: x.id, from: r.from, to: r.to })}`}
                      className="font-medium hover:underline"
                    >
                      {x.label}
                    </Link>
                    <span className="block text-xs text-slate-500">{x.incharge ?? 'No Class Incharge'}</span>
                  </Td>
                  <Td className="text-right tabular-nums">{x.registers}</Td>
                  <Td
                    className={cx(
                      'text-right font-medium tabular-nums',
                      x.pct !== null && x.pct < r.threshold && 'text-red-700',
                    )}
                  >
                    {pctText(x.pct)}
                  </Td>
                  <Td className="text-right tabular-nums">{x.below || '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : r.rows.length === 0 ? (
        <EmptyState title="No students in this section" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Roll</Th>
              <Th>Student</Th>
              <Th className="text-right">Present</Th>
              <Th className="text-right">Late</Th>
              <Th className="text-right">Absent</Th>
              <Th className="text-right">Leave</Th>
              <Th className="text-right">Attendance</Th>
            </tr>
          </thead>
          <tbody>
            {r.rows.map((x) => (
              <tr key={x.id}>
                <Td className="text-slate-500 tabular-nums">{x.rollNumber}</Td>
                <Td>
                  <Link href={`/staff/students/${x.id}`} className="font-medium hover:underline">
                    {x.name}
                  </Link>
                </Td>
                <Td className="text-right tabular-nums">{x.PRESENT}</Td>
                <Td className="text-right tabular-nums">{x.LATE}</Td>
                <Td className="text-right tabular-nums">{x.ABSENT}</Td>
                <Td className="text-right tabular-nums">{x.LEAVE + x.EXCUSED}</Td>
                <Td
                  className={cx(
                    'text-right font-medium tabular-nums',
                    x.pct !== null && x.pct < r.threshold && 'text-red-700',
                  )}
                >
                  {pctText(x.pct)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}

async function MarksTab({ sectionId, filters }: { sectionId?: string; filters: React.ReactNode }) {
  const ctx = await requirePortal('STAFF', 'reports.read');
  const r = await marksReport(ctx, { sectionId, format: 'json' });
  const csv = `/api/v1/reports/marks?${qs({ sectionId, format: 'csv' })}`;
  return (
    <>
      {filters}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {r.grid ? `${r.grid.section} · every test this year` : 'Every submitted or published test this year'}
        </p>
        <DownloadLink href={csv} />
      </div>
      {r.grid && r.grid.rows.length > 0 && r.grid.columns.length > 0 && (
        <div className="mb-6">
          <Table>
            <thead>
              <tr>
                <Th>Student</Th>
                {r.grid.columns.map((c) => (
                  <Th key={c.id} className="text-right whitespace-nowrap normal-case">
                    {c.label}
                    <span className="block font-normal">/{c.maxMarks}</span>
                  </Th>
                ))}
                <Th className="text-right">Overall</Th>
              </tr>
            </thead>
            <tbody>
              {r.grid.rows.map((x) => (
                <tr key={x.id}>
                  <Td className="whitespace-nowrap">
                    <span className="mr-2 text-slate-400 tabular-nums">{x.rollNumber}</span>
                    {x.name}
                  </Td>
                  {x.cells.map((c, i) => (
                    <Td key={i} className={cx('text-right tabular-nums', c === 'AB' && 'text-slate-400')}>
                      {c ?? '—'}
                    </Td>
                  ))}
                  <Td className="text-right font-medium whitespace-nowrap tabular-nums">
                    {pctText(x.pct)} {x.grade && <Badge>{x.grade}</Badge>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
      {r.groups ? (
        <GroupsTable groups={r.groups} />
      ) : r.summary.length === 0 ? (
        <EmptyState title="No marks yet" description="Tests appear here once a teacher submits marks." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Test</Th>
              <Th>Section</Th>
              <Th className="text-right">Average</Th>
              <Th className="text-right">Highest</Th>
              <Th className="text-right">Lowest</Th>
              <Th className="text-right">Passed</Th>
            </tr>
          </thead>
          <tbody>
            {r.summary.slice(0, 200).map((x) => (
              <tr key={x.id}>
                <Td>
                  <Link href={`/staff/assessments/${x.id}`} className="font-medium hover:underline">
                    {x.subject} · {x.name}
                  </Link>
                  <span className="block text-xs text-slate-500">
                    {new Date(`${x.heldOn}T00:00:00Z`).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      timeZone: 'UTC',
                    })}
                    {x.status !== 'PUBLISHED' && ' · waiting to publish'}
                  </span>
                </Td>
                <Td>{x.section}</Td>
                <Td className="text-right font-medium tabular-nums">{pctText(x.average)}</Td>
                <Td className="text-right tabular-nums">{pctText(x.highest)}</Td>
                <Td className="text-right tabular-nums">{pctText(x.lowest)}</Td>
                <Td className="text-right tabular-nums" title={`Scored at least ${x.passMark}%`}>
                  {pctText(x.passRate)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}

async function AtRiskTab() {
  const ctx = await requirePortal('STAFF', 'reports.read');
  const r = await atRiskReport(ctx);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {r.rows.length} student{r.rows.length === 1 ? '' : 's'} below {r.threshold}% attendance this year (10+ school
          days recorded).
          {r.showGuardian && ' Guardian numbers are included so you can call home.'}
        </p>
        <DownloadLink href="/api/v1/reports/at-risk?format=csv" />
      </div>
      {r.rows.length === 0 ? (
        <EmptyState title="No one is at risk" description={`Every student is at or above ${r.threshold}%.`} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Student</Th>
              <Th className="text-right">Attendance</Th>
              <Th className="text-right">Absent</Th>
              <Th>Last absent</Th>
              {r.showGuardian && <Th>Guardian</Th>}
            </tr>
          </thead>
          <tbody>
            {r.rows.map((x) => (
              <tr key={x.id}>
                <Td>
                  <Link href={`/staff/students/${x.id}`} className="font-medium hover:underline">
                    {x.name}
                  </Link>
                  <span className="block text-xs text-slate-500">
                    {x.section} · {x.incharge ?? 'No Class Incharge'}
                  </span>
                </Td>
                <Td className="text-right font-medium text-red-700 tabular-nums">{x.pct}%</Td>
                <Td className="text-right tabular-nums">{x.absent} days</Td>
                <Td className="text-slate-600">
                  {x.lastAbsent
                    ? new Date(`${x.lastAbsent}T00:00:00Z`).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        timeZone: 'UTC',
                      })
                    : '—'}
                </Td>
                {r.showGuardian && (
                  <Td>
                    {x.guardianName ?? '—'}
                    {x.guardianPhone && (
                      <a href={`tel:${x.guardianPhone}`} className="block text-xs text-[var(--accent)] hover:underline">
                        {formatPhone(x.guardianPhone)}
                      </a>
                    )}
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}

type Group = NonNullable<Awaited<ReturnType<typeof marksReport>>['groups']>[number];

function GroupsTable({ groups }: { groups: Group[] }) {
  if (!groups.length)
    return <EmptyState title="No marks yet" description="Tests appear here once a teacher submits marks." />;
  return (
    <>
      <p className="mb-3 text-sm text-slate-500">
        Each test across all sections. Choose a section above to see every student’s marks.
      </p>
      <Table>
        <thead>
          <tr>
            <Th>Test</Th>
            <Th className="text-right">Sections</Th>
            <Th className="text-right">Average</Th>
            <Th className="text-right">Passed</Th>
            <Th>Lowest section</Th>
            <Th>Highest section</Th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.label}>
              <Td>
                <span className="font-medium">{g.label}</span>
                <span className="block text-xs text-slate-500">
                  {new Date(`${g.heldOn}T00:00:00Z`).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    timeZone: 'UTC',
                  })}
                  {g.waiting > 0 && ` · ${g.waiting} waiting to publish`}
                </span>
              </Td>
              <Td className="text-right tabular-nums">{g.sections}</Td>
              <Td className="text-right font-medium tabular-nums">{pctText(g.average)}</Td>
              <Td className="text-right tabular-nums">{pctText(g.passRate)}</Td>
              <Td className="text-slate-600">
                {g.weakest ? `${g.weakest.section} · ${pctText(g.weakest.average)}` : '—'}
              </Td>
              <Td className="text-slate-600">
                {g.strongest ? `${g.strongest.section} · ${pctText(g.strongest.average)}` : '—'}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
