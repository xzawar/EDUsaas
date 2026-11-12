import { Badge, Card, Empty, ErrorBox, Loading, Money, Row, Screen } from '@/components/ui';
import { Text } from 'react-native';
import { errorText, useGet } from '@/lib/data';
import { periodLabel } from '@/lib/format';
import { font } from '@/lib/theme';

type R = { items: { id: string; period: string; status: string; totalPaisa: number; staff: number }[] };

/** Payroll is prepared on the web (it needs a big screen); the phone shows where each month stands. */
export default function PayrollScreen() {
  const q = useGet<R>('/payroll/runs');
  const d = q.data;
  return (
    <Screen
      title="Payroll"
      subtitle="Monthly salary runs. Prepare and finalise on the web."
      refreshing={q.isFetching}
      onRefresh={q.refetch}
    >
      {q.isError && !d && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
      {!d && q.isLoading && <Loading />}
      {d && d.items.length === 0 && (
        <Card>
          <Empty
            icon="card-outline"
            title="No payroll yet"
            body="Set salaries and run the first month from the web app."
          />
        </Card>
      )}
      {d && d.items.length > 0 && (
        <Card>
          {d.items.map((r) => (
            <Row
              key={r.id}
              title={periodLabel(r.period)}
              subtitle={`${r.staff} staff`}
              right={
                <>
                  <Money paisa={r.totalPaisa} style={{ fontWeight: '600' }} />
                  <Badge tone={r.status === 'PAID' ? 'green' : r.status === 'FINALISED' ? 'blue' : 'amber'}>
                    {r.status === 'DRAFT' ? 'Draft' : r.status === 'FINALISED' ? 'Finalised' : 'Paid'}
                  </Badge>
                </>
              }
            />
          ))}
          <Text style={font.tiny}>Staff see their own payslips in the app once a month is finalised.</Text>
        </Card>
      )}
    </Screen>
  );
}
