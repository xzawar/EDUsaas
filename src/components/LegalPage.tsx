import Link from 'next/link';
import type { ReactNode } from 'react';
import { LEGAL } from '@/lib/legal';

/** Plain, readable layout shared by the privacy policy, terms and account-deletion pages. */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:py-16">
      <Link href="/" className="text-sm font-semibold text-slate-500">
        EDUsaas
      </Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated {LEGAL.updated}</p>
      <div className="legal mt-8 space-y-6 text-[15px] leading-7 text-slate-700 [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">
        {children}
      </div>
      <p className="mt-12 border-t border-slate-200 pt-6 text-sm text-slate-500">
        <Link href="/privacy" className="underline">
          Privacy
        </Link>{' '}
        ·{' '}
        <Link href="/terms" className="underline">
          Terms
        </Link>{' '}
        ·{' '}
        <Link href="/delete-account" className="underline">
          Delete an account
        </Link>
      </p>
    </main>
  );
}

/** How to reach the operator: the support inbox when configured, otherwise in-app Help. */
export function Contact() {
  return LEGAL.email ? (
    <a href={`mailto:${LEGAL.email}`} className="font-medium text-slate-900 underline">
      {LEGAL.email}
    </a>
  ) : (
    <span>the Help page in the app (More → Help)</span>
  );
}
