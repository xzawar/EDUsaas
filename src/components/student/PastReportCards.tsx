import { FileText } from 'lucide-react';

/** Closed years exist only as their report card PDF (spec §10.2). */
export function PastReportCards({ items }: { items: { id: string; year: string }[] }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-1">
      {items.map((a) => (
        <li key={a.id}>
          <a
            href={`/api/v1/archives/${a.id}`}
            target="_blank"
            rel="noopener"
            className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-medium hover:bg-slate-50"
          >
            <FileText className="size-4 text-slate-500" aria-hidden /> Report card {a.year}
          </a>
        </li>
      ))}
    </ul>
  );
}
