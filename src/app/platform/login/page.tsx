import Link from 'next/link';
import type { Metadata } from 'next';
import { AuthLayout } from '@/components/AuthLayout';
import { LoginForm } from '@/components/LoginForm';

export const metadata: Metadata = { title: 'Platform sign in', robots: { index: false } };

export default function PlatformLoginPage() {
  return (
    <AuthLayout
      portal="platform"
      title="Platform console"
      footer={
        <p>
          <Link href="/forgot-password?portal=platform" className="font-medium text-link hover:underline">
            Forgot your password?
          </Link>
        </p>
      }
    >
      <LoginForm portal="platform" />
    </AuthLayout>
  );
}
