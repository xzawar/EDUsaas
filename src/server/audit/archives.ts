import 'server-only';
import { systemDb } from '@/server/db/system';
import { storage } from '@/server/files/storage';
import { notFound } from '@/server/http/errors';
import type { AuthedContext } from '@/server/http/route';

/** A school's archived audit months (spec §10.3): listed and downloadable by people with audit.read, own school only. */
export async function auditArchiveList(ctx: AuthedContext) {
  const rows = await systemDb().auditArchive.findMany({
    where: { tenantId: ctx.tenantId! },
    orderBy: { month: 'desc' },
    take: 60,
  });
  return rows.map((r) => ({ month: r.month, rows: r.rows, createdAt: r.createdAt }));
}

export async function auditArchiveDownload(ctx: AuthedContext, month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw notFound('Archive');
  const row = await systemDb().auditArchive.findFirst({ where: { tenantId: ctx.tenantId!, month } });
  if (!row) throw notFound('Archive');
  const file = await storage()?.get(row.storageKey);
  if (!file) throw notFound('Archive');
  return new Response(file.body as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="audit-log-${month}.json.gz"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
