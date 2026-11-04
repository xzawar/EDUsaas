import { AppShell } from '@/components/AppShell';
import { requirePortal } from '@/server/auth/page';

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePortal('STUDENT');
  return (
    <AppShell
      portal="student"
      homeHref="/student"
      orgName={ctx.session.tenant?.name ?? ''}
      user={ctx.user}
      nav={[{ href: '/student', label: 'Home' }]}
    >
      {children}
    </AppShell>
  );
}
