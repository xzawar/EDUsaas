import { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { Text } from '@/components/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Badge, Button, Card, Chip, Empty, Field, Input, Loading, Money, Row, Screen } from '@/components/ui';
import { Avatar } from '@/components/avatar';
import { BackChip } from '@/components/header';
import { Icon } from '@/components/icon';
import { toast } from '@/components/toast';
import { api } from '@/lib/api';
import { useInvalidate } from '@/lib/data';
import { fmtDate, periodLabel, todayIso, uuid, METHOD_LABELS } from '@/lib/format';
import { openPdf } from '@/lib/files';
import { sendOrQueue } from '@/lib/queue';
import { useSession } from '@/lib/session';
import { colors, font, space } from '@/lib/theme';
import { toPaisa, toRupees } from '@edusaas/shared';
import { useSecureScreen } from '@/lib/secure-screen';

type Hit = { id: string; name: string; username: string | null; rollNumber: number | null; section: string | null };
type Fees = {
  student: {
    id: string;
    name: string;
    username: string | null;
    section: string | null;
    rollNumber: number | null;
    guardianName: string | null;
    guardianPhone: string | null;
  };
  outstandingPaisa: number;
  advancePaisa: number;
  invoices: {
    id: string;
    number: string;
    period: string;
    dueOn: string;
    status: string;
    overdue: boolean;
    totalPaisa: number;
    balancePaisa: number;
  }[];
  payments: {
    id: string;
    receiptNumber: string;
    amountPaisa: number;
    method: string;
    receivedOn: string;
    reversed: boolean;
    isReversal: boolean;
  }[];
};

/** The counter in your pocket: find the student, take the money, share the receipt. Works offline (queued). */
export default function CollectScreen() {
  useSecureScreen('collect');
  const { student: preset } = useLocalSearchParams<{ student?: string }>();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [fees, setFees] = useState<Fees | null>(null);
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState<{ invoiceId?: string; balance?: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const invalidate = useInvalidate();

  async function load(id: string) {
    setLoading(true);
    const r = await api<Fees>(`/students/${id}/fees`).catch(() => null);
    setLoading(false);
    if (r?.ok) setFees(r.data);
    else toast('error', r ? r.error.message : 'No connection');
  }
  useEffect(() => {
    if (preset) void load(preset);
  }, [preset]);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) return setHits([]);
    timer.current = setTimeout(async () => {
      const r = await api<{ students: Hit[] }>(`/search?q=${encodeURIComponent(q.trim())}`).catch(() => null);
      if (r?.ok) setHits(r.data.students.slice(0, 8));
    }, 250);
  }, [q]);
  const open = fees?.invoices.filter((i) => i.status === 'DUE' || i.status === 'PARTIAL') ?? [];

  return (
    <Screen title="Collect" subtitle={fees ? undefined : 'Find a student, take the fee.'}>
      <Input
        placeholder="Search a student"
        value={q}
        onChangeText={setQ}
        autoCorrect={false}
        autoCapitalize="none"
        accessibilityLabel="Find a student"
      />
      {hits.length > 0 && (
        <Card style={{ paddingVertical: 4 }}>
          {hits.map((h) => (
            <Row
              key={h.id}
              title={h.name}
              left={<Avatar name={h.name} size={36} />}
              subtitle={`${h.section ?? 'Not placed'}${h.rollNumber ? ` · Roll ${h.rollNumber}` : ''}`}
              onPress={() => {
                setQ('');
                setHits([]);
                void load(h.id);
              }}
            />
          ))}
        </Card>
      )}
      {loading && <Loading />}
      {!fees && !loading && (
        <Card>
          <Empty icon="search-outline" title="Find the student first" body="Type a name to see their bills." />
        </Card>
      )}
      {fees && (
        <>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar name={fees.student.name} />
              <View style={{ flex: 1 }}>
                <Text style={font.h2} numberOfLines={1}>
                  {fees.student.name}
                </Text>
                <Text style={font.small}>
                  {fees.student.section}
                  {fees.student.rollNumber ? ` · Roll ${fees.student.rollNumber}` : ''}
                </Text>
              </View>
            </View>
            <Text style={[font.small, { marginTop: 8 }]}>To pay</Text>
            <Money
              paisa={fees.outstandingPaisa}
              style={[font.display, { color: fees.outstandingPaisa > 0 ? colors.ink : colors.green }]}
            />
            {fees.advancePaisa > 0 && (
              <Text style={font.small}>
                Paid ahead: <Money paisa={fees.advancePaisa} />
              </Text>
            )}
          </Card>
          <Button
            icon="cash-outline"
            onPress={() => setPaying({ invoiceId: open[0]?.id, balance: open[0]?.balancePaisa })}
          >
            Take payment
          </Button>
          <Card title="Bills">
            {fees.invoices.length === 0 && <Text style={font.small}>No bills yet.</Text>}
            {fees.invoices.map((i) => (
              <Row
                key={i.id}
                title={periodLabel(i.period)}
                subtitle={`Due ${fmtDate(i.dueOn, { day: 'numeric', month: 'short' })}`}
                right={
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Money paisa={i.balancePaisa > 0 ? i.balancePaisa : i.totalPaisa} style={{ fontWeight: '600' }} />
                    <Badge
                      tone={
                        i.status === 'PAID' ? 'green' : i.overdue ? 'red' : i.status === 'PARTIAL' ? 'amber' : 'slate'
                      }
                    >
                      {i.status === 'PAID'
                        ? 'Paid'
                        : i.status === 'PARTIAL'
                          ? 'Part paid'
                          : i.status === 'VOID'
                            ? 'Cancelled'
                            : i.overdue
                              ? 'Overdue'
                              : 'Due'}
                    </Badge>
                  </View>
                }
                onPress={
                  i.status === 'DUE' || i.status === 'PARTIAL'
                    ? () => setPaying({ invoiceId: i.id, balance: i.balancePaisa })
                    : undefined
                }
              />
            ))}
          </Card>
          {fees.payments.length > 0 && (
            <Card title="Receipts">
              {fees.payments.map((p) => (
                <Row
                  key={p.id}
                  title={`${p.receiptNumber}${p.isReversal ? ' · reversal' : p.reversed ? ' · reversed' : ''}`}
                  subtitle={`${fmtDate(p.receivedOn)} · ${METHOD_LABELS[p.method] ?? p.method}`}
                  right={<Money paisa={p.amountPaisa} style={{ fontWeight: '600' }} />}
                  onPress={() => openPdf(`/payments/${p.id}/receipt`, `receipt-${p.receiptNumber}.pdf`)}
                />
              ))}
            </Card>
          )}
          {paying && (
            <PaymentSheet
              student={fees.student}
              invoices={open}
              preset={paying}
              onClose={() => setPaying(null)}
              onDone={() => {
                setPaying(null);
                void load(fees.student.id);
                invalidate('/mobile/home');
              }}
            />
          )}
        </>
      )}
    </Screen>
  );
}

function PaymentSheet({
  student,
  invoices,
  preset,
  onClose,
  onDone,
}: {
  student: Fees['student'];
  invoices: Fees['invoices'];
  preset: { invoiceId?: string; balance?: number };
  onClose: () => void;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const me = useSession((s) => s.me)!;
  const [invoiceId, setInvoiceId] = useState(preset.invoiceId ?? '');
  const sel = invoices.find((i) => i.id === invoiceId);
  const [amount, setAmount] = useState(preset.balance ? toRupees(preset.balance) : '');
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [advance, setAdvance] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: string; receiptNumber: string; amountPaisa: number; queued: boolean } | null>(
    null,
  );
  const [clientKey] = useState(uuid);
  let paisa = 0;
  try {
    paisa = amount ? toPaisa(amount) : 0;
  } catch {
    paisa = -1;
  }
  const over = !!sel && paisa > sel.balancePaisa;

  async function submit() {
    if (paisa <= 0) return toast('error', 'Enter the amount received.');
    setBusy(true);
    const r = await sendOrQueue<{ payment: { id: string; receiptNumber: string; amountPaisa: number } }>({
      id: uuid(),
      path: '/payments',
      method: 'POST',
      body: {
        studentId: student.id,
        invoiceId: invoiceId || undefined,
        amountPaisa: paisa,
        method,
        reference: reference || undefined,
        receivedOn: todayIso(),
        clientKey,
        allowAdvance: advance || !invoiceId,
      },
      label: `Payment ${student.name} · ${toRupees(paisa)}`,
      userId: me.user.id,
    });
    setBusy(false);
    if (r.status === 'rejected') return toast('error', r.message);
    if (r.status === 'queued') return setDone({ id: '', receiptNumber: 'Pending', amountPaisa: paisa, queued: true });
    setDone({ ...r.data.payment, queued: false });
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: space.xl, paddingTop: insets.top + 16, gap: space.lg }}
        keyboardShouldPersistTaps="handled"
      >
        {done ? (
          <>
            <Icon name="checkmark-circle" size={56} color={colors.green} />
            <Text style={font.h1}>{done.queued ? 'Saved on this phone' : `Receipt ${done.receiptNumber}`}</Text>
            <Money paisa={done.amountPaisa} style={{ fontSize: 34, fontWeight: '700' }} />
            <Text style={font.small}>
              {done.queued
                ? 'It sends when you’re online; the receipt number comes then.'
                : 'Share the receipt with the parent.'}
            </Text>
            {!done.queued && (
              <Button
                icon="share-outline"
                onPress={() => openPdf(`/payments/${done.id}/receipt`, `receipt-${done.receiptNumber}.pdf`)}
              >
                Share receipt PDF
              </Button>
            )}
            <Button variant="secondary" onPress={onDone}>
              Done
            </Button>
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row' }}>
              <BackChip onPress={onClose} />
            </View>
            <Text style={font.h1}>Take payment</Text>
            <Text style={font.small}>
              {student.name} · {student.section}
            </Text>
            <Field label="Bill">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {invoices.map((i) => (
                  <Chip
                    key={i.id}
                    active={invoiceId === i.id}
                    onPress={() => {
                      setInvoiceId(i.id);
                      setAmount(toRupees(i.balancePaisa));
                    }}
                  >
                    {periodLabel(i.period)} · {toRupees(i.balancePaisa)}
                  </Chip>
                ))}
                <Chip active={invoiceId === ''} onPress={() => setInvoiceId('')}>
                  Pay ahead
                </Chip>
              </View>
            </Field>
            <Field label="Amount (PKR)" error={paisa < 0 ? 'Enter a number like 4500' : null}>
              <Input
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
                style={{ fontSize: 28, fontWeight: '700', minHeight: 64, paddingVertical: 0 }}
              />
            </Field>
            {over && (
              <Chip active={advance} onPress={() => setAdvance((a) => !a)}>
                {advance ? '✓ ' : ''}More than the bill: keep the extra for next month
              </Chip>
            )}
            <Field label="Paid by">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {Object.entries(METHOD_LABELS)
                  .filter(([k]) => k !== 'CHEQUE')
                  .map(([k, l]) => (
                    <Chip key={k} active={method === k} onPress={() => setMethod(k)}>
                      {l}
                    </Chip>
                  ))}
              </View>
            </Field>
            {method !== 'CASH' && (
              <Field label="Reference (optional)">
                <Input value={reference} onChangeText={setReference} autoCapitalize="characters" />
              </Field>
            )}
            <Button
              onPress={submit}
              loading={busy}
              disabled={paisa <= 0 || (over && !advance)}
              icon="checkmark-circle-outline"
            >
              Record payment
            </Button>
          </>
        )}
      </ScrollView>
    </Modal>
  );
}
