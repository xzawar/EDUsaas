import type { Metadata } from 'next';
import { AuthLayout } from '@/components/AuthLayout';
import { ForgotPasswordForm } from '@/components/PasswordForms';

export const metadata: Metadata = { title: 'Reset password' };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ portal?: string }> }) {
  const portal = (await searchParams).portal === 'platform' ? 'platform' : 'staff';
  return (
    <AuthLayout portal={portal} title="Reset your password">
      <p className="-mt-3 mb-5 text-sm text-slate-600">
        Enter the email address you sign in with. Teachers and students don&apos;t have email logins; their School Admin
        resets their passwords.
      </p>
      <ForgotPasswordForm portal={portal} />
    </AuthLayout>
  );
}
