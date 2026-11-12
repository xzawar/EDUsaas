import { useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card, Empty, ErrorBox, Loading, Money, Row, Screen } from '@/components/ui';
import { errorText, useGet } from '@/lib/data';
import { fmtDate, periodLabel, METHOD_LABELS } from '@/lib/format';
import { openPdf } from '@/lib/files';
import { colors, font } from '@/lib/theme';
import { ClaimSheet } from '@/screens/ClaimSheet';

type Fees = {
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
    lateFeePaisa: number;
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
  claims: {
    id: string;
    amountPaisa: number;
    method: string;
    reference: string;
    status: string;
    decisionNote: string | null;
  }[];
};

function statusBadge(i: Fees['invoices'][number]) {
  if (i.status === 'PAID') return <Badge tone="green">Paid</Badge>;
  if (i.status === 'VOID') return <Badge>Cancelled</Badge>;
  if (i.status === 'PARTIAL')
    return <Badge tone={i.overdue ? 'red' : 'amber'}>{i.overdue ? 'Part paid · overdue' : 'Part paid'}</Badge>;
  return <Badge tone={i.overdue ? 'red' : 'slate'}>{i.overdue ? 'Overdue' : 'Due'}</Badge>;
}

/** Student / parent: what's owed, receipts, and "I have paid" with a screenshot. */
export default function FeesScreen() {
  const q = useGet<Fees>('/me/fees');
  const d = q.data;
  const [claiming, setClaiming] = useState(false);
  const open = d?.invoices.filter((i) => i.status === 'DUE' || i.status === 'PARTIAL') ?? [];
  const pending = d?.claims.filter((c) => c.status === 'PENDING') ?? [];
  return (
    <Screen
      title="Fees"
      subtitle="Pay at the school office, or send proof of a transfer here."
      refreshing={q.isFetching}
      onRefresh={q.refetch}
    >
      {q.isError && !d && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
      {!d && q.isLoading && <Loading />}
      {d && (
        <>
          <View
            style={{
              backgroundColor: d.outstandingPaisa > 0 ? colors.redSoft : colors.greenSoft,
              borderRadius: 20,
              padding: 18,
              gap: 4,
            }}
          >
            <Text style={font.small}>To pay</Text>
            <Money paisa={d.outstandingPaisa} style={{ fontSize: 32, fontWeight: '700' }} />
            <Text style={font.small}>
              {d.outstandingPaisa > 0
                ? `${open.length} bill${open.length === 1 ? '' : 's'} open`
                : 'All paid. Thank you!'}
            </Text>
            {d.advancePaisa > 0 && (
              <Text style={font.small}>
                Paid in advance: <Money paisa={d.advancePaisa} />
              </Text>
            )}
            {open.length > 0 && (
              <Button onPress={() => setClaiming(true)} icon="camera-outline" style={{ marginTop: 8 }}>
                I have paid
              </Button>
            )}
          </View>
          {pending.length > 0 && (
            <Card title="Waiting for the school office">
              {pending.map((c) => (
                <Row
                  key={c.id}
                  title={<Money paisa={c.amountPaisa} style={{ fontWeight: '600' }} />}
                  subtitle={`${METHOD_LABELS[c.method] ?? c.method} · ref ${c.reference}`}
                  right={<Badge tone="amber">Checking</Badge>}
                />
              ))}
            </Card>
          )}
          <Card title="Bills">
            {d.invoices.length === 0 && (
              <Empty
                icon="receipt-outline"
                title="No bills yet"
                body="Your monthly bill appears here when the school issues it."
              />
            )}
            {d.invoices.map((i) => (
              <Row
                key={i.id}
                title={periodLabel(i.period)}
                subtitle={`${i.number} · due ${fmtDate(i.dueOn)}${i.lateFeePaisa > 0 ? ' · incl. late fee' : ''}`}
                right={
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Money paisa={i.balancePaisa > 0 ? i.balancePaisa : i.totalPaisa} style={{ fontWeight: '600' }} />
                    {statusBadge(i)}
                  </View>
                }
              />
            ))}
          </Card>
          {d.payments.filter((p) => !p.isReversal).length > 0 && (
            <Card title="Receipts">
              {d.payments
                .filter((p) => !p.isReversal)
                .map((p) => (
                  <Row
                    key={p.id}
                    title={p.receiptNumber}
                    subtitle={`${fmtDate(p.receivedOn)} · ${METHOD_LABELS[p.method] ?? p.method}${p.reversed ? ' · reversed' : ''}`}
                    right={
                      <Money
                        paisa={p.amountPaisa}
                        style={{ fontWeight: '600', textDecorationLine: p.reversed ? 'line-through' : 'none' }}
                      />
                    }
                    onPress={() => openPdf(`/payments/${p.id}/receipt`, `receipt-${p.receiptNumber}.pdf`)}
                  />
                ))}
            </Card>
          )}
          {d.claims.some((c) => c.status === 'REJECTED') && (
            <Card title="Not accepted">
              {d.claims
                .filter((c) => c.status === 'REJECTED')
                .map((c) => (
                  <Row key={c.id} title={<Money paisa={c.amountPaisa} />} subtitle={c.decisionNote ?? 'Rejected'} />
                ))}
            </Card>
          )}
          {claiming && (
            <ClaimSheet
              bills={open.map((i) => ({ id: i.id, number: i.number, period: i.period, balancePaisa: i.balancePaisa }))}
              onClose={() => {
                setClaiming(false);
                void q.refetch();
              }}
            />
          )}
        </>
      )}
    </Screen>
  );
}
