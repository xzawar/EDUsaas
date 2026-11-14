import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/text';
import { Button, Card, Chip, ErrorBox, Loading, Screen } from '@/components/ui';
import { toast } from '@/components/toast';
import { errorText, useGet, useInvalidate } from '@/lib/data';
import { fmtDate, todayIso, uuid } from '@/lib/format';
import { sendOrQueue } from '@/lib/queue';
import { useSession } from '@/lib/session';
import { colors, font, radius } from '@/lib/theme';

type Status = 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE' | 'EXCUSED';
type Sheet = {
  section: { id: string; label: string };
  date: string;
  today: string;
  submitted: { at: string; by: string } | null;
  canEdit: boolean;
  lockedReason: string | null;
  mode: string;
  period: number;
  periods: { period: number; label: string }[];
  students: { id: string; name: string; rollNumber: number | null; status: Status | null; onApprovedLeave: boolean }[];
};
const OPTIONS: { s: Status; label: string; color: string; bg: string }[] = [
  // The chosen mark is a solid control in its meaning's colour, so a full register reads at a glance.
  { s: 'PRESENT', label: 'P', color: '#fff', bg: colors.green },
  { s: 'ABSENT', label: 'A', color: '#fff', bg: colors.red },
  { s: 'LATE', label: 'L', color: colors.ink, bg: colors.amber },
  { s: 'LEAVE', label: 'Lv', color: '#fff', bg: colors.deep2 },
];

/** The register (spec §6): one tap per student, works offline, resend-safe through the client UUID. */
export default function RegisterScreen() {
  const { sectionId, date, period } = useLocalSearchParams<{ sectionId: string; date?: string; period?: string }>();
  const me = useSession((s) => s.me)!;
  const router = useRouter();
  const invalidate = useInvalidate();
  const path = `/attendance/sheet?sectionId=${sectionId}${date ? `&date=${date}` : ''}${period ? `&period=${period}` : ''}`;
  const q = useGet<Sheet>(path);
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data)
      setMarks(
        Object.fromEntries(q.data.students.map((s) => [s.id, s.status ?? (s.onApprovedLeave ? 'LEAVE' : 'PRESENT')])),
      );
  }, [q.data]);
  const counts = useMemo(
    () => Object.values(marks).reduce((a, s) => ({ ...a, [s]: (a[s] ?? 0) + 1 }), {} as Record<string, number>),
    [marks],
  );
  const d = q.data;

  async function save() {
    if (!d) return;
    setBusy(true);
    const r = await sendOrQueue({
      id: uuid(),
      path: '/attendance/batches',
      method: 'POST',
      body: {
        sectionId: d.section.id,
        date: d.date,
        clientUuid: uuid(),
        clientRecordedAt: new Date().toISOString(),
        period: d.mode === 'PER_PERIOD' ? d.period : undefined,
        records: d.students.map((s) => ({ studentId: s.id, status: marks[s.id] ?? 'PRESENT' })),
      },
      label: `Register ${d.section.label} · ${fmtDate(d.date)}`,
      userId: me.user.id,
    });
    setBusy(false);
    if (r.status === 'rejected') return toast('error', r.message);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    toast(
      r.status === 'queued' ? 'info' : 'success',
      r.status === 'queued' ? 'Saved on this phone. It will send when you’re online.' : 'Register saved',
    );
    invalidate('/attendance');
    invalidate('/mobile/home');
    router.back();
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: d
            ? `${d.section.label} · ${fmtDate(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}`
            : 'Register',
        }}
      />
      <Screen padded>
        {q.isError && !d && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
        {!d && q.isLoading && <Loading />}
        {d && (
          <>
            {d.mode === 'PER_PERIOD' && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {d.periods.map((p) => (
                  <Chip
                    key={p.period}
                    active={p.period === d.period}
                    onPress={() => router.setParams({ period: String(p.period) })}
                  >
                    {p.label}
                  </Chip>
                ))}
              </View>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={font.small}>
                {counts.PRESENT ?? 0} present · {counts.ABSENT ?? 0} absent · {counts.LATE ?? 0} late ·{' '}
                {counts.LEAVE ?? 0} leave
              </Text>
              {d.canEdit && (
                <Pressable
                  onPress={() =>
                    setMarks(Object.fromEntries(d.students.map((s) => [s.id, s.onApprovedLeave ? 'LEAVE' : 'PRESENT'])))
                  }
                >
                  <Text style={{ color: colors.accent, fontWeight: '600', fontSize: 13 }}>All present</Text>
                </Pressable>
              )}
            </View>
            {d.submitted && (
              <Text style={font.tiny}>
                Taken by {d.submitted.by}. {d.canEdit ? 'Changes are corrections and are audited.' : ''}
              </Text>
            )}
            {!!d.lockedReason && <ErrorBox message={d.lockedReason} />}
            <Card style={{ gap: 0, paddingVertical: 4 }}>
              {d.students.map((s, i) => (
                <View
                  key={s.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    paddingVertical: 8,
                    borderTopWidth: i ? 1 : 0,
                    borderTopColor: colors.line,
                  }}
                >
                  <Text style={[font.tiny, { width: 26, textAlign: 'right' }]}>{s.rollNumber ?? ''}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, color: colors.ink }} numberOfLines={1}>
                      {s.name}
                    </Text>
                    {s.onApprovedLeave && <Text style={font.tiny}>On approved leave</Text>}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    {OPTIONS.map((o) => {
                      const on = marks[s.id] === o.s;
                      return (
                        <Pressable
                          key={o.s}
                          disabled={!d.canEdit}
                          accessibilityLabel={`${s.name}: ${o.s.toLowerCase()}`}
                          onPress={() => {
                            void Haptics.selectionAsync().catch(() => undefined);
                            setMarks((m) => ({ ...m, [s.id]: o.s }));
                          }}
                          style={{
                            width: 40,
                            height: 36,
                            borderRadius: radius.md,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: on ? o.bg : '#fff',
                            borderWidth: on ? 0 : 1,
                            borderColor: colors.line,
                          }}
                        >
                          <Text style={{ fontWeight: '700', color: on ? o.color : colors.faint, fontSize: 13 }}>
                            {o.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </Card>
            {d.canEdit && (
              <Button onPress={save} loading={busy} icon="checkmark-circle-outline">
                {d.submitted ? 'Save corrections' : 'Save register'}
              </Button>
            )}
            {d.date === todayIso() && (
              <Text style={[font.tiny, { textAlign: 'center' }]}>
                Offline? It still saves and sends later. <Ionicons name="cloud-offline-outline" size={12} />
              </Text>
            )}
          </>
        )}
      </Screen>
    </>
  );
}
