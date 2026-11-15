import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { Text } from '@/components/text';
import { Badge, Button, Card, Empty, ErrorBox, Loading, Money, Row, Screen, SeeAll, Stat } from '@/components/ui';
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

type LatestResult = {
  id: string;
  subject: string;
  heldOn: string;
  score: number | null;
  maxMarks: number;
  absent: boolean;
};

/** Student: class and teacher first, then today's lessons, attendance, latest results and subjects. No money here. */
function StudentHome({ d, go: push }: { d: Home; go: Go }) {
  const att = d.attendance;
  const o = d.overview as {
    section: string | null;
    rollNumber: number;
    classTeacher: string | null;
    subjects: { name: string; teacher: string | null }[];
  } | null;
  const results = (d.latestResults ?? []) as LatestResult[];
  const last = results[0];
  return (
    <>
      {o?.section && (
        <Card>
          <Text style={font.small}>Your class</Text>
          <Text style={font.title}>
            {o.section} · Roll {o.rollNumber}
          </Text>
          {o.classTeacher ? <Text style={font.small}>Class teacher: {o.classTeacher}</Text> : null}
        </Card>
      )}
      <Tiles>
        <Stat
          tone="violet"
          icon="calendar-outline"
          title="Attendance"
          value={att?.pct != null ? `${att.pct}%` : '—'}
          onPress={() => go(push, '/(app)/attendance')}
        />
        <Stat
          tone="mint"
          icon="ribbon-outline"
          title={last ? `Latest · ${last.subject}` : 'Latest test'}
          value={last ? (last.absent ? 'A' : `${last.score ?? '—'}/${last.maxMarks}`) : '—'}
          onPress={() => go(push, last ? `/(app)/marks/result/${last.id}` : '/(app)/marks')}
        />
      </Tiles>
      <Lessons d={d} go={push} sub={(l) => l.entry?.teacher ?? undefined} />
      {results.length > 0 && (
        <Card title="Latest results" action={<SeeAll onPress={() => go(push, '/(app)/marks')} />}>
          {results.map((r) => (
            <Row
              key={r.id}
              title={r.subject}
              subtitle={fmtDate(r.heldOn)}
              right={
                <Text style={{ fontWeight: '700', color: r.absent ? colors.red : colors.ink }}>
                  {r.absent ? 'A' : `${r.score ?? '—'}/${r.maxMarks}`}
                </Text>
              }
              onPress={() => go(push, `/(app)/marks/result/${r.id}`)}
            />
          ))}
        </Card>
      )}
      {o && o.subjects.length > 0 && (
        <Card title="Subjects">
          {o.subjects.slice(0, 6).map((sub) => (
            <Row key={sub.name} title={sub.name} right={sub.teacher ?? undefined} />
          ))}
        </Card>
      )}
    </>
  );
}

type TeacherClass = { id: string; label: string; students: number; subjects: string[]; isIncharge: boolean };

/** Teacher: like the website's Today page — check in, what's waiting, today's lessons and my classes. */
function TeacherHome({ d, go: push }: { d: Home; go: Go }) {
  const todo = (d.todo ?? []) as { id: string; label: string; done: boolean }[];
  const pending = todo.filter((s) => !s.done);
  const classes = ((d.overview?.sections ?? []) as TeacherClass[]).slice(0, 5);
  const tasks = [
    ...pending.map((s) => ({ key: s.id, title: `Take ${s.label} register`, href: `/(app)/attendance/${s.id}` })),
    ...(d.toPublish > 0
      ? [{ key: 'publish', title: `Publish ${plural(d.toPublish, 'test')}`, href: '/(app)/marks' }]
      : []),
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
      <Tiles>
        <Stat
          tone="violet"
          icon="checkbox-outline"
          title="Register"
          value={todo.length ? (pending.length ? 'To take' : 'Taken') : 'None today'}
          onPress={() => go(push, pending[0] ? `/(app)/attendance/${pending[0].id}` : '/(app)/attendance')}
        />
        <Stat
          tone="mint"
          icon="people-outline"
          title="Students"
          value={d.overview?.totalStudents ?? '—'}
          onPress={() => go(push, '/(app)/students')}
        />
      </Tiles>
      {tasks.length > 0 && (
        <Card title="To do">
          {tasks.slice(0, GLANCE + 1).map((t) => (
            <Row key={t.key} title={t.title} onPress={() => go(push, t.href)} />
          ))}
        </Card>
      )}
      <Lessons d={d} go={push} sub={(l) => l.entry?.section ?? undefined} />
      {classes.length > 0 && (
        <Card title="My classes" action={<SeeAll label="Students" onPress={() => go(push, '/(app)/students')} />}>
          {classes.map((c) => (
            <Row
              key={c.id}
              title={c.label}
              subtitle={`${plural(c.students, 'student')}${c.subjects.length ? ` · ${c.subjects.join(', ')}` : ''}`}
              right={c.isIncharge ? <Badge tone="blue">Incharge</Badge> : undefined}
              onPress={() => go(push, `/(app)/students?sectionId=${c.id}`)}
            />
          ))}
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
      <Card>
        <Row
          left={<Icon name="bag-outline" size={22} color={colors.deep} />}
          title="Expenses"
          subtitle="Spent this month"
          right={<Money paisa={f.monthExpensesPaisa} style={{ fontWeight: '700', color: colors.ink }} />}
          onPress={() => go(push, '/(app)/more/expenses')}
        />
        {d.clerk && (
          <Row
            left={<Icon name="person-add-outline" size={22} color={colors.deep} />}
            title="Add a student"
            subtitle={d.admissions ? `${d.admissions.admitted} admitted this month` : undefined}
            onPress={() => go(push, '/(app)/students/new')}
          />
        )}
      </Card>
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
      <Button icon="person-add-outline" onPress={() => go(push, '/(app)/students/new')}>
        Add a student
      </Button>
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
          caption={o ? `${o.schools.active} active · ${o.schools.trial} trial` : undefined}
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
      <Card>
        <Row
          left={<Icon name="pulse-outline" size={22} color={colors.deep} />}
          title="App health"
          subtitle="Who’s online, server load, database"
          onPress={() => go(push, '/(app)/more/stats')}
        />
        {o && (
          <Row
            left={<Icon name="pricetags-outline" size={22} color={colors.deep} />}
            title="Plans"
            subtitle={`${plural(o.subscriptions.active, 'paying school')} · Rs ${o.monthlyRevenue.toLocaleString('en-PK')}/month`}
            onPress={() => go(push, '/(app)/more/plans')}
          />
        )}
      </Card>
    </>
  );
}
