import type { Metadata } from 'next';
import { PageHeader } from '@/components/AppShell';
import { AdminRow, NewAdminButton } from '@/components/platform/PlatformForms';
import { Card, EmptyState } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { listPlatformAdmins } from '@/server/platform/admins';

export const metadata: Metadata = { title: 'Platform admins' };

export default async function AdminsPage() {
  await requirePortal('PLATFORM', 'platform.admins.manage');
  const { grantable, admins } = await listPlatformAdmins();
  return (
    <>
      <PageHeader
        title="Platform admins"
        description="Operations staff. They see system health; you switch on anything more, per person. They never get school data, billing or school creation."
        actions={<NewAdminButton grantable={grantable} />}
      />
      {admins.length === 0 ? (
        <Card>
          <EmptyState title="No Platform Admins yet" />
        </Card>
      ) : (
        <ul className="space-y-3">
          {admins.map((a) => (
            <AdminRow key={a.id} admin={a} grantable={grantable} />
          ))}
        </ul>
      )}
    </>
  );
}
