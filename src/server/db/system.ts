import 'server-only';
import { PrismaClient } from '@prisma/client';
import { env } from '@/server/env';

/**
 * PRIVILEGED client (role edusaas_system, BYPASSRLS). Lint-restricted to server/auth, server/platform,
 * server/audit and server/jobs. Used for things that are legitimately cross-tenant: login lookups,
 * session validation, the platform console, and background jobs. Still cannot UPDATE/DELETE audit_logs.
 */
const globalForPrisma = globalThis as unknown as { systemDb?: PrismaClient };

export function systemDb(): PrismaClient {
  globalForPrisma.systemDb ??= new PrismaClient({ datasourceUrl: env().SYSTEM_DATABASE_URL, log: ['error'] });
  return globalForPrisma.systemDb;
}

export async function disconnectSystemDb() {
  await globalForPrisma.systemDb?.$disconnect();
  globalForPrisma.systemDb = undefined;
}
