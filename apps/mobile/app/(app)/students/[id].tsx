import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Linking, Text, View } from 'react-native';
import { Badge, Button, Card, ErrorBox, Loading, Row, Screen } from '@/components/ui';
import { errorText, useGet } from '@/lib/data';
import { fmtDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import { font } from '@/lib/theme';

type S = {
  student: {
    id: string;
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
type Att = { pct: number | null; counts: Record<string, number>; threshold: number };

export default function StudentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useSession((s) => s.me)!;
  const router = useRouter();
  const q = useGet<S>(`/students/${id}`);
  const s = q.data?.student;
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: s?.name ?? 'Student' }} />
      <Screen>
        {q.isError && !s && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
        {!s && q.isLoading && <Loading />}
        {s && (
          <>
            <Card>
              <Text style={font.h2}>
                {s.name} {s.status !== 'ACTIVE' && <Badge tone="amber">{s.status.toLowerCase()}</Badge>}
              </Text>
              <Text style={font.small}>
                {s.username} · {s.section ? `${s.section.label} · Roll ${s.rollNumber}` : 'Not placed'}
              </Text>
              {s.section?.classTeacher && <Text style={font.small}>Class Incharge: {s.section.classTeacher}</Text>}
            </Card>
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
              {s.address && <Text style={font.small}>{s.address}</Text>}
              {s.admittedOn && (
                <Text style={font.tiny}>
                  Admitted {fmtDate(s.admittedOn, { day: 'numeric', month: 'short', year: 'numeric' })}
                  {s.admissionNo ? ` · No. ${s.admissionNo}` : ''}
                </Text>
              )}
            </Card>
            {me.permissions.includes('fees.collect') && (
              <Button
                icon="cash-outline"
                onPress={() => router.push({ pathname: '/(app)/collect', params: { student: s.id } } as never)}
              >
                Collect fees
              </Button>
            )}
            <View />
          </>
        )}
      </Screen>
    </>
  );
}
