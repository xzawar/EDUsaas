import { AppShell } from '@/components/AppShell';
import { requirePortal } from '@/server/auth/page';

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePortal('PLATFORM');
  return (
    <AppShell
      portal="platform"
      orgName="Platform console"
      user={ctx.user}
      nav={[{ items: [{ href: '/platform', label: 'Schools', icon: 'schools', exact: true }] }]}
    >
      {children}
    </AppShell>
  );
}
