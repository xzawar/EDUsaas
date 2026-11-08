import { Megaphone, Pin } from 'lucide-react';
import Link from 'next/link';
import type { AuthedContext } from '@/server/http/route';
import { listAnnouncements } from '@/server/school/announcements';

/** Latest announcements as compact cards side by side. Renders nothing when there are none. */
export async function LatestAnnouncements({ ctx, href }: { ctx: AuthedContext; href?: string }) {
  const items = await listAnnouncements(ctx, { limit: 3 });
  if (!items.length) return null;
  return (
    <section aria-label="Announcements">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Announcements</h2>
        {href && (
          <Link href={href} className="text-sm font-medium text-[var(--accent)] hover:underline">
            All
          </Link>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {items.map((a) => (
          <article
            key={a.id}
            className="flex items-start gap-3 rounded-2xl bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-slate-900/[0.04]"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
              {a.pinned ? <Pin className="size-4" aria-label="Pinned" /> : <Megaphone className="size-4" aria-hidden />}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{a.title}</p>
              <p className="line-clamp-2 text-xs text-slate-600">{a.body}</p>
              <p className="mt-1 text-[11px] text-slate-400">
                {a.audienceLabel} ·{' '}
                {new Date(a.createdAt).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  timeZone: 'Asia/Karachi',
                })}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
