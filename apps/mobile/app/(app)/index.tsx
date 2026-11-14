import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { Text } from '@/components/text';
import { Button, Card, Empty, ErrorBox, Loading, Money, Row, Screen, Stat } from '@/components/ui';
import { useGet, errorText } from '@/lib/data';
import { fmtDate, METHOD_LABELS, plural } from '@/lib/format';
import { useSession } from '@/lib/session';
import { colors, font } from '@/lib/theme';
import { CheckInCard } from '@/screens/CheckInCard';

type Home = Record<string, any> & { kind: string }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Lesson = {
  periodNo: number;
  startsAt: string;
  endsAt: string;
  isBreak: boolean;
  entry: { subject: string; teacher: string | null; section?: string } | null;
};

function greeting(name: string) {
  const h = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Karachi' }).format(new Date()),
  );
  return `${h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'}, ${name.split(' ')[0]}`;
}

export default function HomeScreen() {
  const me = useSession((s) => s.me)!;
  const q = useGet<Home>('/mobile/home');
  const router = useRouter();
  const d = q.data;
  return (
    <Screen
      title={greeting(me.user.displayName)}
      subtitle={me.tenant?.name ?? 'EDUsaas platform'}
      refreshing={q.isFetching}
      onRefresh={q.refetch}
    >
      {q.isError && !d && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
      {!d && q.isLoading && <Loading />}
      {d?.kind === 'student' && <StudentHome d={d} go={router.push} />}
      {d?.kind === 'teacher' && <TeacherHome d={d} go={router.push} />}
      {d?.kind === 'school' && <SchoolHome d={d} go={router.push} />}
      {d?.kind === 'accountant' && <AccountantHome d={d} go={router.push} />}
      {d?.kind === 'admissions' && <AdmissionsHome d={d} go={router.push} />}
      {d?.kind === 'platform' && <PlatformHome d={d} go={router.push} />}
      {d && d.kind !== 'platform' && <Announcements items={d.announcements} go={router.push} />}
    </Screen>
  );
}

type Go = (href: never) => void;
const go = (fn: Go, href: string) => fn(href as never);

function Announcements({ items, go: push }: { items: { id: string; title: string; body: string }[]; go: Go }) {
  if (!items?.length) return null;
  return (
    <Card
      title="Announcements"
      action={
        <Text onPress={() => go(push, '/(app)/announcements')} style={{ color: colors.accent, fontWeight: '600' }}>
          All
        </Text>
      }
    >
      {items.map((a) => (
        <Row key={a.id} title={a.title} subtitle={a.body} />
      ))}
    </Card>
  );
}

function StudentHome({ d, go: push }: { d: Home; go: Go }) {
  const att = d.attendance;
  const fees = d.fees;
  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Stat
          tone="violet"
          icon="calendar-outline"
          title="Attendance"
          value={att?.pct != null ? `${att.pct}%` : '—'}
          caption="This year"
          onPress={() => go(push, '/(app)/attendance')}
        />
        <Stat
          tone={fees && fees.outstandingPaisa > 0 ? 'amber' : 'mint'}
          icon="receipt-outline"
          title="Fees"
          value={fees ? fees.outstandingPaisa > 0 ? <Money paisa={fees.outstandingPaisa} /> : 'All paid' : '—'}
          caption={fees?.openBills ? plural(fees.openBills, 'bill') + ' open' : 'Nothing due'}
          onPress={() => go(push, '/(app)/fees')}
        />
      </View>
      {d.lessons?.lessons?.length > 0 && (
        <Card
          title={`${d.lessons.dayName}’s lessons`}
          action={
            <Text onPress={() => go(push, '/(app)/more/timetable')} style={{ color: colors.accent, fontWeight: '600' }}>
              Week
            </Text>
          }
        >
          {d.lessons.lessons.slice(0, 8).map((l: Lesson) => (
            <Row
              key={l.periodNo}
              left={<Text style={[font.tiny, { width: 44 }]}>{l.startsAt}</Text>}
              title={l.isBreak ? 'Break' : (l.entry?.subject ?? 'Free')}
              subtitle={l.entry?.teacher ?? undefined}
            />
          ))}
        </Card>
      )}
    </>
  );
}

function TeacherHome({ d, go: push }: { d: Home; go: Go }) {
  const todo = (d.todo ?? []) as { id: string; label: string; done: boolean }[];
  const pending = todo.filter((s) => !s.done);
  return (
    <>
      <CheckInCard checkin={d.checkin} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Stat
          tone="pink"
          icon="checkbox-outline"
          title="Registers"
          value={todo.length ? `${todo.length - pending.length} of ${todo.length} taken` : 'None assigned'}
          onPress={() => go(push, '/(app)/attendance')}
        />
        <Stat
          tone="amber"
          icon="airplane-outline"
          title="Leave"
          value={d.approvals ? plural(d.approvals, 'request') + ' to decide' : 'Nothing waiting'}
          onPress={() => go(push, '/(app)/leave')}
        />
      </View>
      {pending.length > 0 && (
        <Card title="Take attendance">
          {pending.map((s) => (
            <Row
              key={s.id}
              title={s.label}
              subtitle="Register not taken yet"
              onPress={() => go(push, `/(app)/attendance/${s.id}`)}
            />
          ))}
        </Card>
      )}
      {d.lessons?.lessons?.length > 0 && (
        <Card
          title={`${d.lessons.dayName}`}
          action={
            <Text onPress={() => go(push, '/(app)/more/timetable')} style={{ color: colors.accent, fontWeight: '600' }}>
              Week
            </Text>
          }
        >
          {d.lessons.lessons.map((l: Lesson) => (
            <Row
              key={l.periodNo}
              left={<Text style={[font.tiny, { width: 44 }]}>{l.startsAt}</Text>}
              title={l.isBreak ? 'Break' : (l.entry?.subject ?? 'Free')}
              subtitle={l.entry?.section ?? undefined}
            />
          ))}
        </Card>
      )}
      {d.drafts > 0 && (
        <Card>
          <Row
            title={`${plural(d.drafts, 'test')} with marks to finish`}
            subtitle="Enter and submit marks, even offline"
            onPress={() => go(push, '/(app)/marks')}
          />
        </Card>
      )}
    </>
  );
}

function SchoolHome({ d, go: push }: { d: Home; go: Go }) {
  const can = useSession((s) => s.can);
  const att = d.attendance;
  const t = d.teachers;
  const todos = [
    d.approvals > 0 && { n: d.approvals, text: 'leave requests to decide', href: '/(app)/leave' },
    d.toPublish > 0 && { n: d.toPublish, text: 'tests ready to publish', href: '/(app)/marks' },
    att?.pending?.length > 0 && { n: att.pending.length, text: 'registers not taken', href: '/(app)/attendance' },
    d.finance?.claimsPending > 0 &&
      can('fees.collect') && { n: d.finance.claimsPending, text: 'payment proofs to check', href: '/(app)/claims' },
  ].filter(Boolean) as { n: number; text: string; href: string }[];
  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Stat
          tone="violet"
          icon="calendar-outline"
          title="Attendance today"
          value={att?.todayPct != null ? `${att.todayPct}%` : 'No registers yet'}
          caption={att ? `${att.sectionsSubmitted} of ${att.sectionsTotal} registers` : 'No current year'}
          onPress={() => go(push, '/(app)/attendance')}
        />
        <Stat
          tone="sky"
          icon="people-outline"
          title="Teachers in"
          value={t ? `${t.present + t.late} of ${t.total}` : '—'}
          caption={t?.late ? `${t.late} late` : undefined}
          onPress={() => go(push, '/(app)/more/checkins')}
        />
        <Stat
          tone="mint"
          icon="school-outline"
          title="Students"
          value={d.counts?.students ?? '—'}
          caption={d.counts ? `${d.counts.teachers} teachers · ${d.counts.sections} sections` : undefined}
          onPress={() => go(push, '/(app)/students')}
        />
        {d.finance && (
          <Stat
            tone="amber"
            icon="wallet-outline"
            title="Still owed"
            value={<Money paisa={d.finance.outstandingPaisa} />}
            caption={
              <>
                Collected this month <Money paisa={d.finance.monthCollectedPaisa} />
              </>
            }
            onPress={() => go(push, '/(app)/finance')}
          />
        )}
      </View>
      <Card title="Needs you">
        {todos.length === 0 ? (
          <Text style={font.small}>All clear.</Text>
        ) : (
          todos.map((x) => (
            <Row key={x.text} left={<Count n={x.n} />} title={x.text} onPress={() => go(push, x.href)} />
          ))
        )}
      </Card>
      {att?.atRiskCount > 0 && (
        <Card>
          <Row
            title={`${att.atRiskCount} students below the attendance target`}
            subtitle="The full list with guardian numbers is in Reports on the web."
          />
        </Card>
      )}
    </>
  );
}

function Count({ n }: { n: number }) {
  return (
    <View
      style={{
        minWidth: 34,
        height: 34,
        borderRadius: 10,
        backgroundColor: colors.accentSoft,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 6,
      }}
    >
      <Text style={{ fontWeight: '700', color: colors.accent }}>{n}</Text>
    </View>
  );
}

function AccountantHome({ d, go: push }: { d: Home; go: Go }) {
  const f = d.finance;
  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Stat
          tone="mint"
          icon="cash-outline"
          title="Collected today"
          value={<Money paisa={f.collectedTodayPaisa} />}
          caption={fmtDate(f.today)}
          onPress={() => go(push, '/(app)/collect')}
        />
        <Stat
          tone="violet"
          icon="receipt-outline"
          title="This month"
          value={<Money paisa={f.monthCollectedPaisa} />}
          caption={f.monthBills ? `${f.monthBills} bills issued` : 'No bills yet'}
          onPress={() => go(push, '/(app)/invoices')}
        />
        <Stat
          tone="amber"
          icon="alert-circle-outline"
          title="Outstanding"
          value={<Money paisa={f.outstandingPaisa} />}
          caption={plural(f.defaulters, 'student') + ' overdue'}
          onPress={() => go(push, '/(app)/invoices?status=OVERDUE')}
        />
        <Stat
          tone="pink"
          icon="checkmark-done-outline"
          title="Proofs to check"
          value={f.claimsPending}
          onPress={() => go(push, '/(app)/claims')}
        />
      </View>
      <Card title="Recent payments">
        {f.recentPayments.length === 0 ? (
          <Text style={font.small}>No payments yet.</Text>
        ) : (
          f.recentPayments.map(
            (p: { id: string; receiptNumber: string; student: string; amountPaisa: number; method: string }) => (
              <Row
                key={p.id}
                title={p.student}
                subtitle={`${p.receiptNumber} · ${METHOD_LABELS[p.method] ?? p.method}`}
                right={<Money paisa={p.amountPaisa} style={{ fontWeight: '600' }} />}
              />
            ),
          )
        )}
      </Card>
      <Button onPress={() => go(push, '/(app)/collect')} icon="cash-outline">
        Collect a fee
      </Button>
    </>
  );
}

function AdmissionsHome({ d, go: push }: { d: Home; go: Go }) {
  const a = d.admissions;
  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Stat
          tone="mint"
          icon="school-outline"
          title="Students"
          value={d.counts?.students ?? '—'}
          onPress={() => go(push, '/(app)/students')}
        />
        <Stat
          tone="violet"
          icon="person-add-outline"
          title={a ? `Admitted in ${a.month}` : 'Admitted'}
          value={a?.admitted ?? '—'}
          caption={a?.withdrawn ? `${a.withdrawn} withdrawn` : undefined}
        />
        <Stat
          tone="sky"
          icon="albums-outline"
          title="Seats left"
          value={a?.seatsLeft ?? 'No limits'}
          caption={a?.full ? plural(a.full, 'section') + ' full' : undefined}
        />
      </View>
      <Card title="Recent admissions">
        {d.recentAdmissions.length === 0 ? (
          <Empty title="No students yet" />
        ) : (
          d.recentAdmissions.map((s: { id: string; name: string; username: string; section: string }) => (
            <Row
              key={s.id}
              title={s.name}
              subtitle={`${s.username} · ${s.section}`}
              onPress={() => go(push, `/(app)/students/${s.id}`)}
            />
          ))
        )}
      </Card>
    </>
  );
}

function PlatformHome({ d, go: push }: { d: Home; go: Go }) {
  const o = d.overview;
  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Stat
          tone="sky"
          icon="pulse-outline"
          title={d.health.database === 'ok' ? 'All systems normal' : 'Database down'}
          value={`${d.health.latencyMs} ms`}
          caption={`${d.health.users} accounts`}
        />
        <Stat
          tone="violet"
          icon="business-outline"
          title="Schools"
          value={d.health.tenants}
          caption={o ? `${o.schools.active} active · ${o.schools.trial} trial` : undefined}
          onPress={() => go(push, '/(app)/schools')}
        />
        {o && (
          <Stat
            tone="mint"
            icon="cash-outline"
            title="Monthly revenue"
            value={<Money paisa={o.monthlyRevenue * 100} />}
            caption={plural(o.subscriptions.active, 'paying school')}
            onPress={() => go(push, '/(app)/more/plans')}
          />
        )}
        <Stat
          tone="pink"
          icon="help-buoy-outline"
          title="Open questions"
          value={d.openTickets}
          caption={o?.awaitingOwner ? `${o.awaitingOwner} access requests need you` : undefined}
          onPress={() => go(push, '/(app)/tickets')}
        />
      </View>
    </>
  );
}
