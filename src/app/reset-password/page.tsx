import type { Metadata } from 'next';
import { AuthLayout } from '@/components/AuthLayout';
import { ResetPasswordForm } from '@/components/PasswordForms';
import { Alert } from '@/components/ui';

export const metadata: Metadata = { title: 'Choose a new password', referrer: 'no-referrer' };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token;
  return (
    <AuthLayout portal="staff" title="Choose a new password">
      {token ? <ResetPasswordForm token={token} /> : <Alert>This reset link is incomplete. Request a new one.</Alert>}
    </AuthLayout>
  );
}
