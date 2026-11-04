'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type NavItem = { href: string; label: string };

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  if (items.length <= 1) return null;
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Main">
      {items.map((item) => {
        const active = item.href === pathname || (item.href.split('/').length > 2 && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium ${
              active
                ? 'border-[var(--accent)] text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
