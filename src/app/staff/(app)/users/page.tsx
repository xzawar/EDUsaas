import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/AppShell';
import { Badge, Card, ROLE_LABELS } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { listSchoolUsers, listUsersQuery } from '@/server/school/users';

export const metadata: Metadata = { title: 'People' };

const ROLES = ['SCHOOL_ADMIN', 'PRINCIPAL', 'ADMISSIONS_OFFICER', 'TEACHER', 'STUDENT'] as const;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requirePortal('STAFF', 'users.read');
  const sp = await searchParams;
  const parsed = listUsersQuery.safeParse(sp);
  const query = parsed.success ? parsed.data : listUsersQuery.parse({});
  const { items, nextCursor } = await listSchoolUsers(ctx, query);
  const showEmail = ctx.user.role === 'SCHOOL_ADMIN';
  const link = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ role: query.role, q: query.q, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return `/staff/users${s ? `?${s}` : ''}`;
  };

  return (
    <>
      <PageHeader title="People" description="Everyone with an account at your school." />
      <Card>
        <form className="mb-4 flex flex-wrap gap-2" action="/staff/users">
          <input
            name="q"
            defaultValue={query.q}
            placeholder="Search by name or username"
            aria-label="Search"
            className="min-w-48 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            name="role"
            defaultValue={query.role ?? ''}
            aria-label="Role"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <button className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white">Search</button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Role</th>
                <th className="py-2 pr-4 font-medium">Sign-in</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 font-medium">Last sign-in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((u) => (
                <tr key={u.id}>
                  <td className="py-2.5 pr-4 font-medium">{u.displayName}</td>
                  <td className="py-2.5 pr-4">{ROLE_LABELS[u.role]}</td>
                  <td className="py-2.5 pr-4 font-mono text-xs text-slate-600">
                    {u.username ?? (showEmail && 'email' in u ? (u.email as string | null) : '—')}
                  </td>
                  <td className="py-2.5 pr-4">
                    <Badge tone={u.status === 'ACTIVE' ? 'green' : 'red'}>
                      {u.status === 'ACTIVE' ? 'Active' : 'Disabled'}
                    </Badge>
                  </td>
                  <td className="py-2.5 text-slate-600">
                    {u.lastLoginAt ? u.lastLoginAt.toLocaleDateString('en-GB') : 'Never'}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    No one matches that search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {nextCursor && (
          <div className="mt-4 text-right">
            <Link
              href={link({ cursor: nextCursor })}
              className="text-sm font-medium text-[var(--accent)] hover:underline"
            >
              Next page →
            </Link>
          </div>
        )}
      </Card>
    </>
  );
}
