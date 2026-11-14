import { SearchX } from 'lucide-react';
import Link from 'next/link';
import { buttonClass } from '@/components/ui';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">
      <div className="grid size-20 place-items-center rounded-full bg-tint text-primary">
        <SearchX className="size-9" aria-hidden />
      </div>
      <h1 className="mt-6 t-screen-title">Page not found</h1>
      <p className="mt-2 text-base leading-6 text-secondary">The link may be old, or the record was removed.</p>
      <Link href="/" className={`${buttonClass('primary', 'lg')} mt-8`}>
        Back to start
      </Link>
    </main>
  );
}
