import { Megaphone, Pin } from 'lucide-react';
import Link from 'next/link';
import type { AuthedContext } from '@/server/http/route';
import { listAnnouncements } from '@/server/school/announcements';

/** Latest announcements strip for dashboards. Renders nothing when there are none. */
export async function LatestAnnouncements({ ctx, href }: { ctx: AuthedContext; href?: string }) {
  const items = await listAnnouncements(ctx, { limit: 3 });
  if (!items.length) return null;
  return (
    <section aria-label="Announcements" className="mb-6 space-y-2">
      {items.map((a) => (
        <article
          key={a.id}
          className="flex items-start gap-3 rounded-xl border border-[var(--accent)]/25 bg-[var(--accent)]/5 px-4 py-3"
        >
          {a.pinned ? (
            <Pin className="mt-0.5 size-4 shrink-0 text-[var(--accent)]" aria-label="Pinned" />
          ) : (
            <Megaphone className="mt-0.5 size-4 shrink-0 text-[var(--accent)]" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{a.title}</p>
            <p className="line-clamp-2 text-sm text-slate-700">{a.body}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {a.author} ·{' '}
              {new Date(a.createdAt).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                timeZone: 'Asia/Karachi',
              })}
            </p>
          </div>
          {href && (
            <Link href={href} className="shrink-0 text-xs font-medium text-[var(--accent)] hover:underline">
              All
            </Link>
          )}
        </article>
      ))}
    </section>
  );
}
