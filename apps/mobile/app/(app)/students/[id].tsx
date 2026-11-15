import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { Avatar } from '@/components/avatar';
import { Text } from '@/components/text';
import { Badge, Button, Card, ErrorBox, Loading, Row, Screen, StatusPill } from '@/components/ui';
import { attendanceStyle } from '@/lib/attendance';
import { errorText, useGet } from '@/lib/data';
import { fmtDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import { colors, font } from '@/lib/theme';
import { LoginSheet } from '@/screens/LoginSheet';

type S = {
  student: {
    id: string;
    userId: string;
    name: string;
    username: string;
    status: string;
    rollNumber: number | null;
    admissionNo: string | null;
    guardianName: string | null;
    guardianPhone: string | null;
    address: string | null;
    admittedOn: string | null;
    section: { label: string; classTeacher: string | null; year: string } | null;
  };
};
type Overview = {
  attendance: {
    pct: number | null;
    counts: Record<string, number>;
    threshold: number;
    recent: { date: string; status: string }[];
  };
  results: {
    latest: { id: string; subject: string; heldOn: string; score: number | null; maxMarks: number; absent: boolean }[];
    subjects: { subject: string; pct: number | null; grade: string | null }[];
  };
};

/** A student's page. The class incharge and the office also see attendance and the report; the admin can set the
 * sign-in. */
export default function StudentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useSession((s) => s.me)!;
  const router = useRouter();
  const q = useGet<S>(`/students/${id}`);
  // Answers 404 for people who may not see the report; then the page just shows the details.
  const ov = useGet<Overview>(`/students/${id}/overview`, { retry: false });
  const [login, setLogin] = useState(false);
  const s = q.data?.student;
  const o = ov.data;
  const low = !!o && o.attendance.pct !== null && o.attendance.pct < o.attendance.threshold;
  return (
    <Screen back refreshing={q.isFetching} onRefresh={() => void (q.refetch(), ov.refetch())}>
      {q.isError && !s && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
      {!s && q.isLoading && <Loading />}
      {s && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <Avatar name={s.name} size={64} />
            <View style={{ flex: 1 }}>
              <Text style={font.title}>{s.name}</Text>
              <Text style={font.small}>
                {s.section ? `${s.section.label} · Roll ${s.rollNumber}` : 'Not placed'}
                {s.status !== 'ACTIVE' ? ` · ${s.status.toLowerCase()}` : ''}
              </Text>
            </View>
          </View>
          {o && (
            <>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Card style={{ flex: 1 }}>
                  <Text style={font.small}>Attendance</Text>
                  <Text style={[font.number, { color: low ? colors.red : colors.ink }]}>
                    {o.attendance.pct === null ? '—' : `${o.attendance.pct}%`}
                  </Text>
                </Card>
                <Card style={{ flex: 1 }}>
                  <Text style={font.small}>Absent</Text>
                  <Text style={font.number}>{o.attendance.counts.ABSENT ?? 0}</Text>
                </Card>
              </View>
              {o.attendance.recent.length > 0 && (
                <Card title="Last days">
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {o.attendance.recent.slice(0, 10).map((d) => (
                      <StatusPill
                        key={d.date}
                        status={d.status}
                        label={`${fmtDate(d.date, { day: 'numeric', month: 'short' })} ${attendanceStyle(d.status).short}`}
                      />
                    ))}
                  </View>
                </Card>
              )}
              {o.results.subjects.length > 0 && (
                <Card title="Report">
                  {o.results.subjects.map((r) => (
                    <Row
                      key={r.subject}
                      title={r.subject}
                      right={
                        <Text style={{ fontWeight: '700', color: colors.ink }}>
                          {r.pct === null ? '—' : `${r.pct}%`}
                          {r.grade ? ` · ${r.grade}` : ''}
                        </Text>
                      }
                    />
                  ))}
                </Card>
              )}
              {o.results.latest.length > 0 && (
                <Card title="Latest tests">
                  {o.results.latest.map((t) => (
                    <Row
                      key={t.id}
                      title={t.subject}
                      subtitle={fmtDate(t.heldOn)}
                      right={
                        <Text style={{ fontWeight: '700', color: t.absent ? colors.red : colors.ink }}>
                          {t.absent ? 'A' : `${t.score ?? '—'}/${t.maxMarks}`}
                        </Text>
                      }
                    />
                  ))}
                </Card>
              )}
            </>
          )}
          <Card title="Details">
            <Row title="Username" right={s.username} />
            {s.admissionNo ? <Row title="Admission no." right={s.admissionNo} /> : null}
            {s.section?.classTeacher ? <Row title="Class incharge" right={s.section.classTeacher} /> : null}
            {s.admittedOn ? (
              <Row
                title="Admitted"
                right={fmtDate(s.admittedOn, { day: 'numeric', month: 'short', year: 'numeric' })}
              />
            ) : null}
          </Card>
          {(s.guardianName || s.guardianPhone) && (
            <Card title="Guardian">
              <Row
                title={s.guardianName ?? '—'}
                subtitle={s.guardianPhone ?? undefined}
                right={
                  s.guardianPhone ? (
                    <Button
                      variant="secondary"
                      icon="call-outline"
                      onPress={() => Linking.openURL(`tel:${s.guardianPhone}`)}
                    >
                      Call
                    </Button>
                  ) : undefined
                }
              />
              {!!s.address && <Text style={font.small}>{s.address}</Text>}
            </Card>
          )}
          {me.permissions.includes('fees.collect') && (
            <Button
              icon="cash-outline"
              onPress={() => router.push({ pathname: '/(app)/collect', params: { student: s.id } } as never)}
            >
              Collect fees
            </Button>
          )}
          {me.permissions.includes('users.manage') && (
            <Button variant="secondary" icon="key-outline" onPress={() => setLogin(true)}>
              Change sign-in
            </Button>
          )}
          {s.status !== 'ACTIVE' && <Badge tone="amber">{s.status.toLowerCase()}</Badge>}
          {login && (
            <LoginSheet
              userId={s.userId}
              name={s.name}
              username={s.username}
              email={null}
              onClose={(changed) => {
                setLogin(false);
                if (changed) void q.refetch();
              }}
            />
          )}
        </>
      )}
    </Screen>
  );
}
