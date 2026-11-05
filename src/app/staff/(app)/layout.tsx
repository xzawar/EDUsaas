import { AppShell } from '@/components/AppShell';
import { requirePortal } from '@/server/auth/page';
import { myPhotoUrl } from '@/server/school/photos';
import { staffNav } from './nav';

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePortal('STAFF');
  const { groups, mobileTabs } = staffNav(ctx);
  return (
    <AppShell
      portal="staff"
      orgName={ctx.session.tenant?.name ?? ''}
      user={{ ...ctx.user, photoUrl: await myPhotoUrl(ctx) }}
      nav={groups}
      mobileTabs={mobileTabs}
      tools={{ search: ctx.can('students.search'), notifications: true }}
    >
      {children}
    </AppShell>
  );
}
