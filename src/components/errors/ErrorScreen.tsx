'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

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
    <div className="mx-auto mt-16 flex max-w-md flex-col items-center rounded-3xl bg-white px-6 py-10 text-center shadow-sm">
      <div className="grid size-12 place-items-center rounded-full bg-amber-100 text-amber-700">
        <AlertTriangle className="size-6" aria-hidden />
      </div>
      <h1 className="mt-4 text-lg font-semibold">This page didn’t load</h1>
      <p className="mt-1 text-sm text-slate-500">
        Something went wrong on our side. Try again; if it keeps happening, tell your school office or EDUsaas support.
      </p>
      {error.digest && <p className="mt-3 font-mono text-xs text-slate-400">Reference: {error.digest}</p>}
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          <RotateCcw className="size-4" aria-hidden /> Try again
        </button>
        <Link
          href={home}
          className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
