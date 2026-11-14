import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/AppShell';
import { AccountActions, NewStaffButton } from '@/components/people/StaffAccounts';
import { Avatar, Badge, Card, ROLE_LABELS, TabLinks, Table, Td, Th } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { listSchoolUsers } from '@/server/school/users';

export const metadata: Metadata = { title: 'Staff accounts' };

const ROLES = ['SCHOOL_ADMIN', 'PRINCIPAL', 'ADMISSIONS_OFFICER', 'ACCOUNTANT', 'TEACHER'] as const;

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const ctx = await requirePortal('STAFF', 'users.read');
  const sp = await searchParams;
  const role = ROLES.find((r) => r === sp.role);
  const results = await Promise.all((role ? [role] : ROLES).map((r) => listSchoolUsers(ctx, { role: r, limit: 50 })));
  const items = results.flatMap((r) => r.items);
  const canManage = ctx.can('users.manage');
  const fmt = (d: Date | null) =>
    d ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(d) : 'Never';

  return (
    <>
      <PageHeader
        title="Staff accounts"
        description="Everyone who signs in on the Staff Portal. Student accounts are managed from each student’s page."
        actions={canManage ? <NewStaffButton schoolName={ctx.session.tenant?.name ?? ''} /> : undefined}
      />
      <Card>
        <div className="mb-4">
          <TabLinks
            active={role ?? 'ALL'}
            tabs={[
              { key: 'ALL', label: 'All staff', href: '/staff/users' },
              ...ROLES.map((r) => ({ key: r, label: ROLE_LABELS[r]!, href: `/staff/users?role=${r}` })),
            ]}
          />
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Role</Th>
              <Th className="hidden md:table-cell">Signs in with</Th>
              <Th className="hidden sm:table-cell">Last sign-in</Th>
              {canManage && <Th />}
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id}>
                <Td>
                  <span className="flex items-center gap-3">
                    <Avatar name={u.displayName} size="sm" />
                    <span className="font-medium">
                      {u.displayName} {u.status !== 'ACTIVE' && <Badge tone="red">Disabled</Badge>}
                      {u.id === ctx.user.id && <Badge tone="blue">You</Badge>}
                    </span>
                  </span>
                </Td>
                <Td>{ROLE_LABELS[u.role]}</Td>
                <Td className="hidden font-mono text-xs text-slate-600 md:table-cell">
                  {u.username ?? ('email' in u ? (u.email as string | null) : null) ?? '—'}
                </Td>
                <Td className="hidden text-slate-600 sm:table-cell">{fmt(u.lastLoginAt)}</Td>
                {canManage && (
                  <Td className="text-right">
                    {u.role === 'TEACHER' ? (
                      <Link href="/staff/teachers" className="text-sm font-medium text-link hover:underline">
                        Manage on Teachers
                      </Link>
                    ) : u.role !== 'SCHOOL_ADMIN' ? (
                      <AccountActions
                        userId={u.id}
                        name={u.displayName}
                        status={u.status}
                        schoolName={ctx.session.tenant?.name ?? ''}
                      />
                    ) : null}
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
