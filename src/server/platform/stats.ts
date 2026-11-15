import 'server-only';
import os from 'node:os';
import { systemDb } from '@/server/db/system';

/**
 * How the whole app is doing, for the Platform Owner: who is using it, how busy it is, and how the server and
 * database are holding up. Counts and sizes only; no school records.
 */
export async function appStats() {
  const db = systemDb();
  const now = new Date();
  const day = new Date(now.getTime() - 24 * 3600_000);
  const week = new Date(now.getTime() - 7 * 24 * 3600_000);
  const started = Date.now();
  await db.$queryRaw`SELECT 1`;
  const dbLatencyMs = Date.now() - started;
  const [roles, activeSessions, activeNow, loginsToday, loginsWeek, installs, versions, jobs, size, schools, students] =
    await Promise.all([
      db.user.groupBy({ by: ['role'], where: { deletedAt: null, status: 'ACTIVE' }, _count: true }),
      db.session.count({ where: { expiresAt: { gt: now } } }),
      db.session.count({
        where: { expiresAt: { gt: now }, lastSeenAt: { gt: new Date(now.getTime() - 15 * 60_000) } },
      }),
      db.user.count({ where: { lastLoginAt: { gt: day } } }),
      db.user.count({ where: { lastLoginAt: { gt: week } } }),
      db.pushToken.count(),
      db.pushToken.groupBy({ by: ['appVersion'], _count: true }),
      db.job.groupBy({ by: ['status'], _count: true }),
      db.$queryRaw<{ bytes: bigint }[]>`SELECT pg_database_size(current_database()) AS bytes`,
      db.tenant.groupBy({ by: ['status'], _count: true }),
      db.student.count({ where: { status: 'ACTIVE' } }),
    ]);
  const mem = process.memoryUsage();
  const [load1, load5, load15] = os.loadavg();
  return {
    checkedAt: now.toISOString(),
    usage: {
      activeNow,
      activeSessions,
      loginsToday,
      loginsWeek,
      appInstalls: installs,
      appVersions: versions
        .map((v) => ({ version: v.appVersion ?? 'unknown', count: v._count }))
        .sort((a, b) => b.count - a.count),
    },
    people: {
      students,
      byRole: Object.fromEntries(roles.map((r) => [r.role, r._count])) as Record<string, number>,
    },
    schools: Object.fromEntries(schools.map((s) => [s.status, s._count])) as Record<string, number>,
    server: {
      load: { one: load1, five: load5, fifteen: load15 },
      cpus: os.cpus().length,
      memoryUsedMb: Math.round(mem.rss / 1048576),
      memoryTotalMb: Math.round(os.totalmem() / 1048576),
      uptimeHours: Math.round((process.uptime() / 3600) * 10) / 10,
    },
    database: { latencyMs: dbLatencyMs, sizeMb: Math.round(Number(size[0]?.bytes ?? 0) / 1048576) },
    jobs: Object.fromEntries(jobs.map((j) => [j.status, j._count])) as Record<string, number>,
  };
}
