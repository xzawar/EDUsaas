import { AppShell } from '@/components/AppShell';
import { requirePortal } from '@/server/auth/page';

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePortal('PLATFORM');
  return (
    <AppShell
      portal="platform"
      homeHref="/platform"
      orgName="Platform console"
      user={ctx.user}
      nav={[{ href: '/platform', label: 'Schools' }]}
    >
      {children}
    </AppShell>
  );
}
