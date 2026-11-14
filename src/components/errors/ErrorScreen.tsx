'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { buttonClass } from '@/components/ui';

/**
 * Shown inside the app shell when a page fails to load, instead of the browser's blank "Application error" page.
 * The error text is never shown (it can hold internal details); the digest lets support find it in the logs.
 */
export function ErrorScreen({
  error,
  reset,
  home,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  home: string;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col items-center px-6 py-10 text-center">
      <div className="grid size-20 place-items-center rounded-full bg-tint text-primary">
        <AlertTriangle className="size-9" aria-hidden />
      </div>
      <h1 className="mt-6 t-screen-title">This page didn’t load</h1>
      <p className="mt-2 text-base leading-6 text-secondary">
        Something went wrong on our side. Try again; if it keeps happening, tell your school office or EDUsaas support.
      </p>
      {error.digest && <p className="mt-3 font-mono text-xs text-tertiary">Reference: {error.digest}</p>}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className={buttonClass('primary', 'lg')}>
          <RotateCcw className="size-4" aria-hidden /> Try again
        </button>
        <Link href={home} className={buttonClass('secondary', 'lg')}>
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
