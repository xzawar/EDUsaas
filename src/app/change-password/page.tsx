import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthLayout } from '@/components/AuthLayout';
import { ChangePasswordForm } from '@/components/PasswordForms';
import { currentSession } from '@/server/auth/page';
import type { PortalKey } from '@/components/portal-theme';

export const metadata: Metadata = { title: 'Change password' };

export default async function ChangePasswordPage() {
  const session = await currentSession();
  if (!session) redirect('/');
  const portal = session.portal.toLowerCase() as PortalKey;
  return (
    <AuthLayout portal={portal} title={session.user.mustChangePassword ? 'Set your password' : 'Change password'}>
      <p className="-mt-3 mb-5 text-sm text-slate-600">Signed in as {session.user.username ?? session.user.email}</p>
      <ChangePasswordForm forced={session.user.mustChangePassword} />
    </AuthLayout>
  );
}
