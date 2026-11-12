import Link from 'next/link';
import { PORTAL_THEME, type PortalKey } from '@/components/portal-theme';

const ENTRIES: { portal: PortalKey; href: string; cta: string }[] = [
  { portal: 'student', href: '/login', cta: 'Student sign in' },
  { portal: 'staff', href: '/staff/login', cta: 'Staff sign in' },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-4 py-16">
      <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">EDUsaas</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">School management, simply.</h1>
      <p className="mt-3 max-w-2xl text-slate-600">
        Choose how you sign in. Students and school staff each have their own portal.
      </p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {ENTRIES.map(({ portal, href, cta }) => {
          const t = PORTAL_THEME[portal];
          return (
            <Link
              key={portal}
              href={href}
              className={`group rounded-2xl bg-gradient-to-br ${t.panel} p-6 text-white shadow-sm transition hover:shadow-lg`}
            >
              <p className="text-sm font-medium uppercase tracking-widest text-white/70">{t.name}</p>
              <p className="mt-2 text-lg leading-snug">{t.tagline}</p>
              <p className="mt-6 font-semibold">
                {cta}{' '}
                <span aria-hidden className="inline-block transition group-hover:translate-x-1">
                  →
                </span>
              </p>
            </Link>
          );
        })}
      </div>
      <p className="mt-8 text-sm text-slate-600">
        On Android?{' '}
        <Link href="/download" className="font-medium text-slate-900 underline">
          Get the app
        </Link>
      </p>
    </main>
  );
}
