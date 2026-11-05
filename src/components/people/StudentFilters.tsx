'use client';

import { Search } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Input, Select } from '@/components/ui';

/** Search + section filter that live-update the URL (debounced), so results are shareable and server-rendered. */
export function StudentFilters({
  sections,
  lockedSection,
}: {
  sections: { id: string; label: string }[];
  lockedSection?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');

  function update(next: Record<string, string | null>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    p.delete('cursor');
    router.replace(`${pathname}?${p.toString()}`);
  }

  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get('q') ?? '') !== q) update({ q: q || null });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-400" aria-hidden />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, username, admission no. or guardian phone"
          aria-label="Search students"
          className="pl-9"
        />
      </div>
      {!lockedSection && (
        <Select
          aria-label="Section"
          value={params.get('sectionId') ?? ''}
          onChange={(e) => update({ sectionId: e.target.value || null })}
          className="sm:w-48"
        >
          <option value="">All sections</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
}
