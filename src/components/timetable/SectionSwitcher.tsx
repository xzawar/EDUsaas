'use client';

import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui';

export function SectionSwitcher({ sections, value, allowMine }: { sections: { id: string; label: string }[]; value: string | null; allowMine?: boolean }) {
  const router = useRouter();
  return (
    <Select aria-label="Class" value={value ?? ''} onChange={(e) => router.push(e.target.value ? `/staff/timetable?section=${e.target.value}` : '/staff/timetable')} className="w-44">
      {allowMine && <option value="">My timetable</option>}
      {sections.map((s) => (
        <option key={s.id} value={s.id}>
          Class {s.label}
        </option>
      ))}
    </Select>
  );
}
