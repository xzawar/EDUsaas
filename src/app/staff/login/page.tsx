import Link from 'next/link';
import type { Metadata } from 'next';
import { AuthLayout } from '@/components/AuthLayout';
import { LoginForm } from '@/components/LoginForm';

export const metadata: Metadata = { title: 'Staff sign in' };

export default function StaffLoginPage() {
  return (
    <AuthLayout
      portal="staff"
      title="Staff sign in"
      footer={
        <>
          <p>
            Office staff with an email login can{' '}
            <Link href="/forgot-password?portal=staff" className="font-medium text-link hover:underline">
              reset their password
            </Link>
            . Teachers: ask your School Admin.
          </p>
          <p>
            Student?{' '}
            <Link href="/login" className="font-medium text-link hover:underline">
              Go to the Student Portal
            </Link>
          </p>
        </>
      }
    >
      <LoginForm portal="staff" />
    </AuthLayout>
  );
}
