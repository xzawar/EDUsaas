import { useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/text';
import * as Haptics from 'expo-haptics';
import { Button, Card } from '@/components/ui';
import { toast } from '@/components/toast';
import { useInvalidate } from '@/lib/data';
import { fmtTime, uuid } from '@/lib/format';
import { sendOrQueue } from '@/lib/queue';
import { useSession } from '@/lib/session';
import { colors, font } from '@/lib/theme';

type CheckIn = { status: string | null; checkedInAt: string | null; late?: boolean } | null;

/** Teacher check-in (spec §6.4): one tap, works offline (queued with a client key). */
export function CheckInCard({ checkin }: { checkin: CheckIn }) {
  const me = useSession((s) => s.me)!;
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<string | null>(null);
  const done = checkin?.checkedInAt || local;
  async function checkIn() {
    setBusy(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    const r = await sendOrQueue({
      id: uuid(),
      path: '/teacher-attendance/check-in',
      method: 'POST',
      body: { clientUuid: uuid(), clientRecordedAt: new Date().toISOString() },
      label: 'Check-in',
      userId: me.user.id,
    });
    setBusy(false);
    if (r.status === 'rejected') return toast('error', r.message);
    setLocal(new Date().toISOString());
    toast(
      r.status === 'queued' ? 'info' : 'success',
      r.status === 'queued' ? 'Saved. It will send when you’re back online.' : 'Checked in',
    );
    invalidate('/mobile/home');
  }
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={font.h2}>{done ? 'You’re in' : 'Good to see you'}</Text>
          <Text style={font.small}>
            {done
              ? `Checked in at ${fmtTime(done)}${checkin?.status === 'LATE' ? ' · late' : ''}`
              : 'Check in for today.'}
          </Text>
        </View>
        {!done && (
          <Button onPress={checkIn} loading={busy} icon="finger-print-outline">
            Check in
          </Button>
        )}
        {!!done && <Text style={{ color: colors.green, fontWeight: '700' }}>✓</Text>}
      </View>
    </Card>
  );
}
