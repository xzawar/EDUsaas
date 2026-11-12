import { useState } from 'react';
import { Image, Modal, Pressable, Text, View } from 'react-native';
import { Button, Card, Empty, ErrorBox, Field, Input, Loading, Money, Screen } from '@/components/ui';
import { toast } from '@/components/toast';
import { api, authHeaders, fileUrl } from '@/lib/api';
import { errorText, useGet, useInvalidate } from '@/lib/data';
import { fmtDate, METHOD_LABELS } from '@/lib/format';
import { colors, font } from '@/lib/theme';
import { useEffect } from 'react';

type Claim = {
  id: string;
  amountPaisa: number;
  method: string;
  reference: string;
  paidOn: string;
  hasProof: boolean;
  invoice: { number: string; period: string };
  student: { id: string; name: string; section: string | null };
};

function Proof({ id, size }: { id: string; size: number }) {
  const [h, setH] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    void authHeaders().then(setH);
  }, []);
  if (!h) return <View style={{ width: size, height: size, backgroundColor: '#f1f5f9', borderRadius: 10 }} />;
  return (
    <Image
      source={{ uri: fileUrl(`/fees/claims/${id}/proof`), headers: h }}
      style={{ width: size, height: size, borderRadius: 10 }}
      resizeMode={size > 200 ? 'contain' : 'cover'}
    />
  );
}

/** Office: parents' transfer proofs. Check against the bank, confirm (receipt issued) or reject with a note. */
export default function ClaimsScreen() {
  const q = useGet<{ items: Claim[]; pending: number }>('/fees/claims?status=PENDING');
  const invalidate = useInvalidate();
  const [viewing, setViewing] = useState<Claim | null>(null);
  const [rejecting, setRejecting] = useState<Claim | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const d = q.data;
  async function decide(c: Claim, decision: 'CONFIRM' | 'REJECT') {
    setBusy(c.id);
    const r = await api(`/fees/claims/${c.id}/decide`, {
      body: { decision, note: decision === 'REJECT' ? note.trim() : undefined },
    }).catch(() => null);
    setBusy(null);
    if (!r) return toast('error', 'No connection');
    if (!r.ok) return toast('error', r.error.message);
    toast('success', decision === 'CONFIRM' ? 'Confirmed. Receipt issued.' : 'Rejected. The parent has been told.');
    setRejecting(null);
    setNote('');
    invalidate('/fees/claims');
    invalidate('/mobile/home');
  }
  return (
    <Screen
      title="Payment proofs"
      subtitle="Check each one against your bank, then confirm or reject."
      refreshing={q.isFetching}
      onRefresh={q.refetch}
    >
      {q.isError && !d && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
      {!d && q.isLoading && <Loading />}
      {d && d.items.length === 0 && (
        <Card>
          <Empty
            icon="checkmark-done-outline"
            title="Nothing to check"
            body="When a parent sends a payment screenshot, it shows up here."
          />
        </Card>
      )}
      {d?.items.map((c) => (
        <Card key={c.id}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Pressable onPress={() => setViewing(c)} disabled={!c.hasProof}>
              {c.hasProof ? (
                <Proof id={c.id} size={72} />
              ) : (
                <View style={{ width: 72, height: 72, borderRadius: 10, backgroundColor: '#f1f5f9' }} />
              )}
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600', color: colors.ink }}>
                {c.student.name} <Text style={font.small}>· {c.student.section}</Text>
              </Text>
              <Money paisa={c.amountPaisa} style={{ fontSize: 20, fontWeight: '700' }} />
              <Text style={font.small}>
                {METHOD_LABELS[c.method] ?? c.method} · ref {c.reference} · paid {fmtDate(c.paidOn)}
              </Text>
              <Text style={font.tiny}>
                Bill {c.invoice.number} · {c.invoice.period}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
            <Button variant="secondary" style={{ flex: 1 }} onPress={() => setRejecting(c)} loading={busy === c.id}>
              Reject
            </Button>
            <Button style={{ flex: 1 }} onPress={() => decide(c, 'CONFIRM')} loading={busy === c.id} icon="checkmark">
              Confirm
            </Button>
          </View>
        </Card>
      ))}
      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.85)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onPress={() => setViewing(null)}
        >
          {viewing && <Proof id={viewing.id} size={360} />}
        </Pressable>
      </Modal>
      <Modal visible={!!rejecting} animationType="slide" onRequestClose={() => setRejecting(null)}>
        <View style={{ flex: 1, backgroundColor: colors.bg, padding: 24, paddingTop: 60, gap: 16 }}>
          <Text style={font.h1}>Reject this proof</Text>
          <Text style={font.small}>The parent sees your note, so say what to do next.</Text>
          <Field label="Reason">
            <Input
              value={note}
              onChangeText={setNote}
              multiline
              autoFocus
              style={{ minHeight: 100, textAlignVertical: 'top' }}
              placeholder="e.g. We can’t find this transaction. Please send the full screenshot with the date."
            />
          </Field>
          <Button
            variant="danger"
            disabled={note.trim().length < 3}
            loading={!!busy}
            onPress={() => rejecting && decide(rejecting, 'REJECT')}
          >
            Reject
          </Button>
          <Button variant="ghost" onPress={() => setRejecting(null)}>
            Back
          </Button>
        </View>
      </Modal>
    </Screen>
  );
}
