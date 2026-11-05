-- CreateEnum
CREATE TYPE "SupportGrantStatus" AS ENUM ('PENDING', 'ACTIVE', 'DENIED', 'REVOKED', 'EXPIRED');

-- CreateTable
CREATE TABLE "support_grants" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "requester_name" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "status" "SupportGrantStatus" NOT NULL DEFAULT 'PENDING',
    "decided_by" UUID,
    "decided_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "key" TEXT NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "support_grants_tenant_id_created_at_idx" ON "support_grants"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "support_grants_status_expires_at_idx" ON "support_grants"("status", "expires_at");

-- AddForeignKey
ALTER TABLE "support_grants" ADD CONSTRAINT "support_grants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Support grants: schools can read and decide their own grants (RLS); requests are created by the platform
-- (system role). Grants are never deleted, so the school keeps the full history.
ALTER TABLE support_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON support_grants TO edusaas_app
  USING (tenant_id = (SELECT app_current_tenant())) WITH CHECK (tenant_id = (SELECT app_current_tenant()));
REVOKE INSERT, DELETE, TRUNCATE ON TABLE support_grants FROM edusaas_app;
ALTER TABLE support_grants ADD CONSTRAINT support_grants_duration CHECK (duration_minutes BETWEEN 15 AND 480);
ALTER TABLE support_grants ADD CONSTRAINT support_grants_reason CHECK (char_length(reason) BETWEEN 10 AND 500);
ALTER TABLE support_grants ADD CONSTRAINT support_grants_active_expiry CHECK (status <> 'ACTIVE' OR expires_at IS NOT NULL);

-- Rate limits are infrastructure: the tenant-scoped app role has no business here (RLS on, no policy = no rows).
REVOKE ALL ON TABLE rate_limits FROM edusaas_app;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits FORCE ROW LEVEL SECURITY;
