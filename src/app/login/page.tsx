import Link from 'next/link';
import type { Metadata } from 'next';
import { AuthLayout } from '@/components/AuthLayout';
import { LoginForm } from '@/components/LoginForm';

export const metadata: Metadata = { title: 'Student sign in' };

export default function StudentLoginPage() {
  return (
    <AuthLayout
      portal="student"
      title="Student sign in"
      footer={
        <>
          <p>Forgot your password or username? Ask your school office to reset it.</p>
          <p>
            Teacher or school staff?{' '}
            <Link href="/staff/login" className="font-medium text-[var(--accent)] hover:underline">
              Go to the Staff Portal
            </Link>
          </p>
        </>
      }
    >
      <LoginForm portal="student" />
    </AuthLayout>
  );
}
