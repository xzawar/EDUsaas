import { Card, Empty, ErrorBox, Loading, Money, Row, Screen } from '@/components/ui';
import { errorText, useGet } from '@/lib/data';
import { openPdf } from '@/lib/files';
import { fmtDate, periodLabel } from '@/lib/format';
import { useSecureScreen } from '@/lib/secure-screen';

type P = { items: { id: string; number: string; period: string; netPaisa: number; paidOn: string | null }[] };

export default function PayslipsScreen() {
  useSecureScreen('payslips');
  const q = useGet<P>('/me/payslips');
  const d = q.data;
  return (
    <Screen
      title="My payslips"
      subtitle="Tap to open or share the PDF."
      refreshing={q.isFetching}
      onRefresh={q.refetch}
    >
      {q.isError && !d && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
      {!d && q.isLoading && <Loading />}
      {d && d.items.length === 0 && (
        <Card>
          <Empty
            icon="document-outline"
            title="No payslips yet"
            body="They appear here once the month’s payroll is finalised."
          />
        </Card>
      )}
      {d && d.items.length > 0 && (
        <Card>
          {d.items.map((p) => (
            <Row
              key={p.id}
              title={periodLabel(p.period)}
              subtitle={`${p.number}${p.paidOn ? ` · paid ${fmtDate(p.paidOn)}` : ' · not paid yet'}`}
              right={<Money paisa={p.netPaisa} style={{ fontWeight: '600' }} />}
              onPress={() => openPdf(`/payslips/${p.id}`, `payslip-${p.number}.pdf`)}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}
