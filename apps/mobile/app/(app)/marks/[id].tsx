import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Button, Card, ErrorBox, Loading, Screen } from '@/components/ui';
import { toast } from '@/components/toast';
import { api } from '@/lib/api';
import { errorText, useGet, useInvalidate } from '@/lib/data';
import { uuid } from '@/lib/format';
import { sendOrQueue } from '@/lib/queue';
import { useSession } from '@/lib/session';
import { colors, font, radius } from '@/lib/theme';

type Sheet = {
  assessment: {
    id: string;
    name: string;
    section: string;
    subject: string;
    maxMarks: number;
    status: string;
    canEdit: boolean;
    canSubmit: boolean;
    canPublish: boolean;
    lockedReason: string | null;
    students: { id: string; name: string; rollNumber: number | null; score: number | null; absent: boolean }[];
  };
};

/** Marks sheet: numeric keypad per student, "absent" toggle, saves offline. */
export default function MarkSheetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useSession((s) => s.me)!;
  const router = useRouter();
  const invalidate = useInvalidate();
  const q = useGet<Sheet>(`/assessments/${id}`);
  const a = q.data?.assessment;
  const [v, setV] = useState<Record<string, { score: string; absent: boolean }>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (a)
      setV(
        Object.fromEntries(
          a.students.map((s) => [s.id, { score: s.score === null ? '' : String(s.score), absent: s.absent }]),
        ),
      );
  }, [a]);
  const invalid = a
    ? a.students.some((s) => {
        const x = v[s.id];
        return (
          x &&
          !x.absent &&
          x.score !== '' &&
          (isNaN(Number(x.score)) || Number(x.score) < 0 || Number(x.score) > a.maxMarks)
        );
      })
    : false;

  async function save(submit: boolean) {
    if (!a) return;
    setBusy(true);
    const marks = a.students.map((s) => ({
      studentId: s.id,
      score: v[s.id]?.absent || v[s.id]?.score === '' ? null : Number(v[s.id]?.score),
      absent: !!v[s.id]?.absent,
    }));
    const r = await sendOrQueue({
      id: uuid(),
      path: `/assessments/${a.id}/marks`,
      method: 'PUT',
      body: { marks, submit },
      label: `Marks ${a.section} ${a.subject} · ${a.name}`,
      userId: me.user.id,
    });
    setBusy(false);
    if (r.status === 'rejected') return toast('error', r.message);
    toast(
      r.status === 'queued' ? 'info' : 'success',
      r.status === 'queued'
        ? 'Saved on this phone. It will send when you’re online.'
        : submit
          ? 'Marks submitted'
          : 'Marks saved',
    );
    invalidate('/assessments');
    if (submit) router.back();
  }
  async function publish() {
    if (!a) return;
    setBusy(true);
    const r = await api(`/assessments/${a.id}/publish`, { method: 'POST' }).catch(() => null);
    setBusy(false);
    if (!r) return toast('error', 'No connection');
    if (!r.ok) return toast('error', r.error.message);
    toast('success', 'Published. Students can see their marks.');
    invalidate('/assessments');
    router.back();
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: a ? `${a.section} · ${a.subject}` : 'Marks' }} />
      <Screen>
        {q.isError && !a && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
        {!a && q.isLoading && <Loading />}
        {a && (
          <>
            <Text style={font.small}>
              {a.name} · out of {a.maxMarks} ·{' '}
              {a.status === 'PUBLISHED'
                ? 'published'
                : a.status === 'SUBMITTED'
                  ? 'submitted, waiting to publish'
                  : 'draft'}
            </Text>
            {!!a.lockedReason && !a.canEdit && <ErrorBox message={a.lockedReason} />}
            <Card style={{ gap: 0, paddingVertical: 4 }}>
              {a.students.map((s, i) => {
                const x = v[s.id] ?? { score: '', absent: false };
                const bad =
                  !x.absent &&
                  x.score !== '' &&
                  (isNaN(Number(x.score)) || Number(x.score) > a.maxMarks || Number(x.score) < 0);
                return (
                  <View
                    key={s.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      paddingVertical: 6,
                      borderTopWidth: i ? 1 : 0,
                      borderTopColor: colors.line,
                    }}
                  >
                    <Text style={[font.tiny, { width: 26, textAlign: 'right' }]}>{s.rollNumber ?? ''}</Text>
                    <Text style={{ flex: 1, fontSize: 15, color: colors.ink }} numberOfLines={1}>
                      {s.name}
                    </Text>
                    <Pressable
                      disabled={!a.canEdit}
                      onPress={() => setV((m) => ({ ...m, [s.id]: { score: '', absent: !x.absent } }))}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: radius.pill,
                        backgroundColor: x.absent ? colors.redSoft : '#f8fafc',
                        borderWidth: 1,
                        borderColor: x.absent ? colors.redSoft : colors.line,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '600', color: x.absent ? '#991b1b' : colors.muted }}>
                        Abs
                      </Text>
                    </Pressable>
                    <TextInput
                      editable={a.canEdit && !x.absent}
                      keyboardType="decimal-pad"
                      value={x.absent ? '' : x.score}
                      placeholder="—"
                      placeholderTextColor={colors.faint}
                      onChangeText={(t) =>
                        setV((m) => ({ ...m, [s.id]: { score: t.replace(/[^0-9.]/g, ''), absent: false } }))
                      }
                      accessibilityLabel={`Marks for ${s.name}`}
                      style={{
                        width: 64,
                        height: 40,
                        borderRadius: radius.md,
                        borderWidth: 1,
                        borderColor: bad ? colors.red : colors.line,
                        textAlign: 'center',
                        fontSize: 16,
                        color: colors.ink,
                        backgroundColor: x.absent ? '#f1f5f9' : colors.card,
                      }}
                    />
                  </View>
                );
              })}
            </Card>
            {a.canEdit && (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button
                  variant="secondary"
                  style={{ flex: 1 }}
                  onPress={() => save(false)}
                  loading={busy}
                  disabled={invalid}
                >
                  Save
                </Button>
                {a.canSubmit && (
                  <Button
                    style={{ flex: 1 }}
                    onPress={() => save(true)}
                    loading={busy}
                    disabled={invalid}
                    icon="send-outline"
                  >
                    Submit
                  </Button>
                )}
              </View>
            )}
            {a.canPublish && (
              <Button onPress={publish} loading={busy} icon="megaphone-outline">
                Publish to students
              </Button>
            )}
          </>
        )}
      </Screen>
    </>
  );
}
