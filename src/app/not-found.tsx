import { SearchX } from 'lucide-react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-slate-100 text-slate-500">
        <SearchX className="size-6" aria-hidden />
      </div>
      <h1 className="mt-4 text-2xl font-semibold">Page not found</h1>
      <p className="mt-1 text-sm text-slate-500">The link may be old, or the record was removed.</p>
      <Link
        href="/"
        className="mt-6 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Back to start
      </Link>
    </main>
  );
}
