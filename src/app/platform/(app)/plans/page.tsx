import type { Metadata } from 'next';
import { PageHeader } from '@/components/AppShell';
import { PlanForm } from '@/components/platform/PlatformForms';
import { Badge, Card, EmptyState, Table, Td, Th } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { listPlans } from '@/server/platform/plans';

export const metadata: Metadata = { title: 'Plans' };

export default async function PlansPage() {
  await requirePortal('PLATFORM', 'platform.plans.manage');
  const plans = await listPlans();
  const limit = (v: number | null) => (v === null ? 'No limit' : v.toLocaleString());
  return (
    <>
      <PageHeader
        title="Plans"
        description="What each school can use. New schools start on the cheapest offered plan as a trial."
        actions={<PlanForm label="New plan" />}
      />
      <Card>
        {plans.length === 0 ? (
          <EmptyState
            title="No plans yet"
            description="Create your first plan; new schools will start on it as a trial."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Plan</Th>
                <Th className="text-right">Price / month</Th>
                <Th className="text-right">Students</Th>
                <Th className="text-right">Staff</Th>
                <Th className="text-right">Schools</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id}>
                  <Td className="font-medium">
                    {p.name} {!p.active && <Badge>Retired</Badge>}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {p.priceMonthly ? `PKR ${p.priceMonthly.toLocaleString()}` : 'Free'}
                  </Td>
                  <Td className="text-right tabular-nums">{limit(p.maxStudents)}</Td>
                  <Td className="text-right tabular-nums">{limit(p.maxStaff)}</Td>
                  <Td className="text-right tabular-nums">{p.schools}</Td>
                  <Td className="text-right">
                    <PlanForm plan={p} label="Edit" />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
