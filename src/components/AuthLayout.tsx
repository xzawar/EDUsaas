import Link from 'next/link';
import type { ReactNode } from 'react';
import { PORTAL_THEME, type PortalKey } from '@/components/portal-theme';

/** Sign-in screens: a deep "brand moment" panel beside a calm white form column. */
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
    <main className="grid min-h-screen bg-white lg:grid-cols-[1fr_1.1fr]">
      <aside className="m-2 hidden flex-col justify-between rounded-3xl bg-deep p-12 lg:flex">
        <Link href="/" className="inline-flex items-center gap-2.5 text-lg font-semibold text-white">
          <BrandMark /> EDUsaas
        </Link>
        <div>
          <p className="text-sm font-medium text-white/70">{theme.name}</p>
          <p className="mt-4 max-w-md font-display text-[56px] leading-[0.85] tracking-[-0.01em] text-accent">
            {theme.headline}
          </p>
          <p className="mt-6 max-w-sm text-base leading-6 text-white/80">{theme.tagline}</p>
        </div>
        <p className="text-sm text-white/60">Each school&apos;s data is kept separate and private.</p>
      </aside>
      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-[400px]">
          <div className="mb-10 lg:hidden">
            <Link href="/" className="inline-flex items-center gap-2.5 text-lg font-semibold text-primary">
              <BrandMark /> EDUsaas
            </Link>
            <p className="mt-1 text-sm text-tertiary">{theme.name}</p>
          </div>
          <h1 className="t-screen-title">{title}</h1>
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 space-y-2 border-t border-line pt-6 text-sm text-secondary">{footer}</div>}
        </div>
      </div>
    </main>
  );
}

/** The EDUsaas mark: a periwinkle disc with the deep "E". */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="16" fill="#a99bff" />
      <path d="M11 9.5h10v3h-6.5v2.2h5.8v2.8h-5.8v2h6.6v3H11z" fill="#1c1259" />
    </svg>
  );
}
