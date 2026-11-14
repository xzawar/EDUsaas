import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { Text } from '@/components/text';
import { Badge, Card, Empty, ErrorBox, Loading, Row, Screen } from '@/components/ui';
import { errorText, useGet } from '@/lib/data';
import { fmtDate, plural } from '@/lib/format';
import { useSession } from '@/lib/session';
import { colors, font } from '@/lib/theme';

type Me = {
  counts: Record<string, number>;
  pct: number | null;
  byDay: Record<string, string>;
  today: string;
  threshold: number;
};
type Sections = {
  today: string;
  sections: {
    id: string;
    label: string;
    students: number;
    isIncharge: boolean;
    done: boolean;
    absent: number;
    present: number;
  }[];
};

/** Student: own record. Staff: today's registers (teachers see their sections, overseers the whole school). */
export default function AttendanceScreen() {
  const me = useSession((s) => s.me)!;
  return me.user.role === 'STUDENT' ? <MyAttendance /> : <Registers />;
}

function MyAttendance() {
  const q = useGet<Me>('/attendance/me');
  const d = q.data;
  const days = d
    ? Object.entries(d.byDay)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, 30)
    : [];
  const tone: Record<string, 'green' | 'red' | 'amber' | 'blue' | 'slate'> = {
    PRESENT: 'green',
    ABSENT: 'red',
    LATE: 'amber',
    LEAVE: 'blue',
    EXCUSED: 'slate',
  };
  return (
    <Screen
      title="Attendance"
      subtitle="Present and Late count as attended. Approved leave doesn’t count against you."
      refreshing={q.isFetching}
      onRefresh={q.refetch}
    >
      {q.isError && !d && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
      {!d && q.isLoading && <Loading />}
      {d && (
        <>
          <Card>
            <Text
              style={{
                fontSize: 40,
                fontWeight: '700',
                color: d.pct !== null && d.pct < d.threshold ? colors.red : colors.ink,
              }}
            >
              {d.pct === null ? '—' : `${d.pct}%`}
            </Text>
            <Text style={font.small}>
              {d.counts.PRESENT ?? 0} present · {d.counts.ABSENT ?? 0} absent · {d.counts.LATE ?? 0} late ·{' '}
              {d.counts.LEAVE ?? 0} leave
            </Text>
            {d.pct !== null && d.pct < d.threshold && (
              <Text style={{ color: colors.red, fontSize: 13 }}>Below the school target of {d.threshold}%.</Text>
            )}
          </Card>
          <Card title="Last 30 days">
            {days.length === 0 ? (
              <Empty title="No attendance yet" />
            ) : (
              days.map(([day, st]) => (
                <Row
                  key={day}
                  title={fmtDate(day, { weekday: 'short', day: 'numeric', month: 'short' })}
                  right={<Badge tone={tone[st] ?? 'slate'}>{st.charAt(0) + st.slice(1).toLowerCase()}</Badge>}
                />
              ))
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}

function Registers() {
  const q = useGet<Sections>('/attendance/sections');
  const router = useRouter();
  const d = q.data;
  const taken = d?.sections.filter((s) => s.done).length ?? 0;
  return (
    <Screen
      title="Attendance"
      subtitle={
        d
          ? `${fmtDate(d.today, { weekday: 'long', day: 'numeric', month: 'long' })} · ${taken} of ${d.sections.length} registers taken`
          : undefined
      }
      refreshing={q.isFetching}
      onRefresh={q.refetch}
    >
      {q.isError && !d && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
      {!d && q.isLoading && <Loading />}
      {d && d.sections.length === 0 && (
        <Card>
          <Empty
            icon="checkbox-outline"
            title="No sections to mark"
            body="Your sections appear here once you’re a Class Incharge or assigned to a class."
          />
        </Card>
      )}
      {d && d.sections.length > 0 && (
        <Card>
          {d.sections.map((s) => (
            <Row
              key={s.id}
              title={s.label}
              subtitle={`${plural(s.students, 'student')}${s.done ? ` · ${s.present} present, ${s.absent} absent` : ' · not taken yet'}${s.isIncharge ? ' · your class' : ''}`}
              right={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {s.done ? <Badge tone="green">Done</Badge> : <Badge tone="amber">To do</Badge>}
                </View>
              }
              onPress={() => router.push(`/(app)/attendance/${s.id}` as never)}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}
