import Link from 'next/link';
import type { ReactNode } from 'react';
import { PORTAL_THEME, accentStyle, type PortalKey } from '@/components/portal-theme';

export function AuthLayout({
  portal,
  title,
  children,
  footer,
}: {
  portal: PortalKey;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const theme = PORTAL_THEME[portal];
  return (
    <main style={accentStyle(portal)} className="grid min-h-screen lg:grid-cols-2">
      <aside className={`hidden flex-col justify-between bg-gradient-to-br ${theme.panel} p-12 text-white lg:flex`}>
        <Link href="/" className="text-lg font-semibold tracking-tight">
          EDUsaas
        </Link>
        <div>
          <p className="text-sm font-medium uppercase tracking-widest text-white/70">{theme.name}</p>
          <p className="mt-3 max-w-md text-3xl font-semibold leading-snug">{theme.tagline}</p>
        </div>
        <p className="text-sm text-white/60">Secure school management. Each school&apos;s data is kept separate.</p>
      </aside>
      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Link href="/" className="text-lg font-semibold">
              EDUsaas
            </Link>
            <p className="text-sm text-slate-500">{theme.name}</p>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <div className="mt-6">{children}</div>
          {footer && (
            <div className="mt-8 space-y-2 border-t border-slate-200 pt-6 text-sm text-slate-600">{footer}</div>
          )}
        </div>
      </div>
    </main>
  );
}
