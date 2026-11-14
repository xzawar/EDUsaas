import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { Text } from '@/components/text';
import { Button, Card, Empty, ErrorBox, Loading, Money, Row, Screen, SeeAll, Stat } from '@/components/ui';
import { useGet, errorText } from '@/lib/data';
import { fmtDate, METHOD_LABELS, plural } from '@/lib/format';
import { useSession } from '@/lib/session';
import { colors, font, space } from '@/lib/theme';
import { CheckInCard } from '@/screens/CheckInCard';
import { Icon } from '@/components/icon';

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
      subtitle={me.tenant?.name ?? 'EDUsaas'}
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

/** Lists on Home stay short: a glance, then "See all" for the rest. */
const GLANCE = 3;

function Tiles({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>{children}</View>;
}

/** Only the newest notice; the rest live one tap away. */
function Announcements({ items, go: push }: { items: { id: string; title: string; body: string }[]; go: Go }) {
  if (!items?.length) return null;
  const a = items[0]!;
  return (
    <Card title="Latest notice" action={<SeeAll onPress={() => go(push, '/(app)/announcements')} />}>
      <Row title={a.title} subtitle={a.body} />
    </Card>
  );
}

function Lessons({ d, go: push, sub }: { d: Home; go: Go; sub: (l: Lesson) => string | undefined }) {
  const lessons = (d.lessons?.lessons ?? []).filter((l: Lesson) => !l.isBreak) as Lesson[];
  if (!lessons.length) return null;
  return (
    <Card
      title={`${d.lessons.dayName}`}
      action={<SeeAll label="Week" onPress={() => go(push, '/(app)/more/timetable')} />}
    >
      {lessons.slice(0, GLANCE + 1).map((l) => (
        <Row
          key={l.periodNo}
          left={<Text style={[font.small, { width: 48, fontWeight: '700', color: colors.ink }]}>{l.startsAt}</Text>}
          title={l.entry?.subject ?? 'Free'}
          subtitle={sub(l)}
        />
      ))}
    </Card>
  );
}

function StudentHome({ d, go: push }: { d: Home; go: Go }) {
  const att = d.attendance;
  const fees = d.fees;
  const owes = !!fees && fees.outstandingPaisa > 0;
  return (
    <>
      <Tiles>
        <Stat
          tone="violet"
          icon="calendar-outline"
          title="Attendance"
          value={att?.pct != null ? `${att.pct}%` : '—'}
          onPress={() => go(push, '/(app)/attendance')}
        />
        <Stat
          tone={owes ? 'amber' : 'mint'}
          icon="receipt-outline"
          title={owes ? 'Fees due' : 'Fees'}
          value={fees ? owes ? <Money paisa={fees.outstandingPaisa} /> : 'All paid' : '—'}
          onPress={() => go(push, '/(app)/fees')}
        />
      </Tiles>
      <Lessons d={d} go={push} sub={(l) => l.entry?.teacher ?? undefined} />
    </>
  );
}

function TeacherHome({ d, go: push }: { d: Home; go: Go }) {
  const todo = (d.todo ?? []) as { id: string; label: string; done: boolean }[];
  const pending = todo.filter((s) => !s.done);
  const tasks = [
    ...pending.map((s) => ({ key: s.id, title: `Take ${s.label}`, href: `/(app)/attendance/${s.id}` })),
    ...(d.drafts > 0
      ? [{ key: 'marks', title: `Finish marks for ${plural(d.drafts, 'test')}`, href: '/(app)/marks' }]
      : []),
    ...(d.approvals > 0
      ? [{ key: 'leave', title: `Decide ${plural(d.approvals, 'leave request')}`, href: '/(app)/leave' }]
      : []),
  ];
  return (
    <>
      <CheckInCard checkin={d.checkin} />
      <Card title={tasks.length ? 'To do' : 'All done'}>
        {tasks.length === 0 ? (
          <Text style={font.small}>Registers taken and nothing waiting.</Text>
        ) : (
          tasks.slice(0, GLANCE).map((t) => <Row key={t.key} title={t.title} onPress={() => go(push, t.href)} />)
        )}
      </Card>
      <Lessons d={d} go={push} sub={(l) => l.entry?.section ?? undefined} />
    </>
  );
}

function SchoolHome({ d, go: push }: { d: Home; go: Go }) {
  const can = useSession((s) => s.can);
  const att = d.attendance;
  const t = d.teachers;
  const todos = [
    d.approvals > 0 && { n: d.approvals, text: 'leave requests', href: '/(app)/leave' },
    d.toPublish > 0 && { n: d.toPublish, text: 'tests to publish', href: '/(app)/marks' },
    att?.pending?.length > 0 && { n: att.pending.length, text: 'registers not taken', href: '/(app)/attendance' },
    d.finance?.claimsPending > 0 &&
      can('fees.collect') && { n: d.finance.claimsPending, text: 'proofs to check', href: '/(app)/claims' },
  ].filter(Boolean) as { n: number; text: string; href: string }[];
  return (
    <>
      <Tiles>
        <Stat
          tone="violet"
          icon="calendar-outline"
          title="Attendance today"
          value={att?.todayPct != null ? `${att.todayPct}%` : '—'}
          onPress={() => go(push, '/(app)/attendance')}
        />
        <Stat
          tone="sky"
          icon="people-outline"
          title="Teachers in"
          value={t ? `${t.present + t.late}/${t.total}` : '—'}
          onPress={() => go(push, '/(app)/more/checkins')}
        />
        {d.finance ? (
          <Stat
            tone="amber"
            icon="wallet-outline"
            title="Still owed"
            value={<Money paisa={d.finance.outstandingPaisa} />}
            onPress={() => go(push, '/(app)/finance')}
          />
        ) : (
          <Stat
            tone="mint"
            icon="school-outline"
            title="Students"
            value={d.counts?.students ?? '—'}
            onPress={() => go(push, '/(app)/students')}
          />
        )}
      </Tiles>
      <Card title={todos.length ? 'Needs you' : 'All clear'}>
        {todos.length === 0 ? (
          <Text style={font.small}>Nothing is waiting for you.</Text>
        ) : (
          todos.map((x) => (
            <Row key={x.text} left={<Count n={x.n} />} title={x.text} onPress={() => go(push, x.href)} />
          ))
        )}
      </Card>
    </>
  );
}

function Count({ n }: { n: number }) {
  return (
    <View
      style={{
        minWidth: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: colors.ink,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 8,
      }}
    >
      <Text style={{ fontWeight: '700', color: colors.bg }}>{n}</Text>
    </View>
  );
}

function AccountantHome({ d, go: push }: { d: Home; go: Go }) {
  const f = d.finance;
  return (
    <>
      <Tiles>
        <Stat
          tone="mint"
          icon="cash-outline"
          title="Collected today"
          value={<Money paisa={f.collectedTodayPaisa} />}
          caption={fmtDate(f.today)}
        />
        <Stat
          tone="amber"
          icon="alert-circle-outline"
          title="Still owed"
          value={<Money paisa={f.outstandingPaisa} />}
          caption={f.defaulters ? plural(f.defaulters, 'student') + ' late' : undefined}
          onPress={() => go(push, '/(app)/more/reports')}
        />
        {f.claimsPending > 0 && (
          <Stat
            tone="pink"
            icon="checkmark-done-outline"
            title="Proofs to check"
            value={f.claimsPending}
            onPress={() => go(push, '/(app)/claims')}
          />
        )}
      </Tiles>
      <Button onPress={() => go(push, '/(app)/collect')} icon="cash-outline">
        Collect a fee
      </Button>
      {f.recentPayments.length > 0 && (
        <Card title="Latest payments">
          {f.recentPayments
            .slice(0, GLANCE)
            .map((p: { id: string; receiptNumber: string; student: string; amountPaisa: number; method: string }) => (
              <Row
                key={p.id}
                title={p.student}
                subtitle={METHOD_LABELS[p.method] ?? p.method}
                right={<Money paisa={p.amountPaisa} style={{ fontWeight: '700', color: colors.ink }} />}
              />
            ))}
        </Card>
      )}
    </>
  );
}

function AdmissionsHome({ d, go: push }: { d: Home; go: Go }) {
  const a = d.admissions;
  return (
    <>
      <Tiles>
        <Stat
          tone="mint"
          icon="school-outline"
          title="Students"
          value={d.counts?.students ?? '—'}
          onPress={() => go(push, '/(app)/students')}
        />
        <Stat
          tone="sky"
          icon="albums-outline"
          title="Seats left"
          value={a?.seatsLeft ?? 'Open'}
          caption={a?.full ? plural(a.full, 'section') + ' full' : undefined}
        />
      </Tiles>
      <Card
        title="New students"
        action={d.recentAdmissions.length > GLANCE ? <SeeAll onPress={() => go(push, '/(app)/students')} /> : undefined}
      >
        {d.recentAdmissions.length === 0 ? (
          <Empty title="No students yet" />
        ) : (
          d.recentAdmissions
            .slice(0, GLANCE)
            .map((s: { id: string; name: string; section: string }) => (
              <Row key={s.id} title={s.name} subtitle={s.section} onPress={() => go(push, `/(app)/students/${s.id}`)} />
            ))
        )}
      </Card>
    </>
  );
}

function PlatformHome({ d, go: push }: { d: Home; go: Go }) {
  const o = d.overview;
  const ok = d.health.database === 'ok';
  return (
    <>
      <Card>
        <Row
          left={
            <Icon name={ok ? 'checkmark-circle' : 'alert-circle'} size={24} color={ok ? colors.green : colors.red} />
          }
          title={ok ? 'All systems normal' : 'Database down'}
          subtitle={`${d.health.latencyMs} ms`}
        />
      </Card>
      <Tiles>
        <Stat
          tone="violet"
          icon="business-outline"
          title="Schools"
          value={d.health.tenants}
          onPress={() => go(push, '/(app)/schools')}
        />
        <Stat
          tone="pink"
          icon="help-buoy-outline"
          title="Open questions"
          value={d.openTickets}
          caption={o?.awaitingOwner ? `${o.awaitingOwner} need you` : undefined}
          onPress={() => go(push, '/(app)/tickets')}
        />
      </Tiles>
    </>
  );
}
