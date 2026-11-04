import 'server-only';
import { Prisma, PrismaClient } from '@prisma/client';
import { env } from '@/server/env';

/**
 * RLS-enforced client (role edusaas_app). Never query it directly: use withTenant(),
 * which sets the transaction-local tenant so Postgres policies can filter rows.
 */
const globalForPrisma = globalThis as unknown as { appDb?: PrismaClient };

function appDb(): PrismaClient {
  globalForPrisma.appDb ??= new PrismaClient({ datasourceUrl: env().DATABASE_URL, log: ['error'] });
  return globalForPrisma.appDb;
}

export type TenantTx = Prisma.TransactionClient;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runs `fn` in one transaction scoped to `tenantId`. Every query inside is filtered by RLS.
 * `set_config(..., true)` is transaction-local, so it is safe behind a transaction-mode pooler.
 */
export async function withTenant<T>(
  scope: { tenantId: string; userId?: string },
  fn: (tx: TenantTx) => Promise<T>,
  options?: { timeoutMs?: number },
): Promise<T> {
  if (!UUID.test(scope.tenantId)) throw new Error('withTenant: invalid tenant id');
  return appDb().$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${scope.tenantId}, true), set_config('app.user_id', ${scope.userId ?? ''}, true)`;
      return fn(tx);
    },
    { timeout: options?.timeoutMs ?? 10000 },
  );
}

/** For tests and graceful shutdown. */
export async function disconnectAppDb() {
  await globalForPrisma.appDb?.$disconnect();
  globalForPrisma.appDb = undefined;
}
