-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'ANSWERED', 'CLOSED');

-- AlterEnum
ALTER TYPE "SupportGrantStatus" ADD VALUE 'AWAITING_OWNER';

-- AlterTable
ALTER TABLE "support_grants" ADD COLUMN     "owner_approved_by" UUID,
ADD COLUMN     "ticket_id" UUID;

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price_monthly" INTEGER NOT NULL DEFAULT 0,
    "max_students" INTEGER,
    "max_staff" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "started_on" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "renews_on" DATE,
    "notes" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_permission_grants" (
    "user_id" UUID NOT NULL,
    "permission" TEXT NOT NULL,
    "granted_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_permission_grants_pkey" PRIMARY KEY ("user_id","permission")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_messages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "author_name" TEXT NOT NULL,
    "from_platform" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_archives" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "year_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_archives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_archives" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "month" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "rows" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_archives_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plans_name_key" ON "plans"("name");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_tenant_id_key" ON "subscriptions"("tenant_id");

-- CreateIndex
CREATE INDEX "subscriptions_plan_id_idx" ON "subscriptions"("plan_id");

-- CreateIndex
CREATE INDEX "support_tickets_tenant_id_created_at_idx" ON "support_tickets"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "support_tickets_status_updated_at_idx" ON "support_tickets"("status", "updated_at");

-- CreateIndex
CREATE INDEX "ticket_messages_ticket_id_created_at_idx" ON "ticket_messages"("ticket_id", "created_at");

-- CreateIndex
CREATE INDEX "student_archives_tenant_id_idx" ON "student_archives"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_archives_student_id_academic_year_id_key" ON "student_archives"("student_id", "academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "audit_archives_tenant_id_month_key" ON "audit_archives"("tenant_id", "month");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_permission_grants" ADD CONSTRAINT "platform_permission_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_archives" ADD CONSTRAINT "student_archives_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── Security ─────────────────────────────────────────────────────────────────
-- Tenant-owned: school users see only their own rows (RLS) and the database rejects cross-tenant references.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['support_tickets', 'ticket_messages', 'student_archives'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I TO edusaas_app USING (tenant_id = (SELECT app_current_tenant())) WITH CHECK (tenant_id = (SELECT app_current_tenant()))', t);
  END LOOP;
END $$;
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('created_by', 'users');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON ticket_messages
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('ticket_id', 'support_tickets');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON student_archives
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('student_id', 'students', 'academic_year_id', 'academic_years');
ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_subject CHECK (char_length(subject) BETWEEN 3 AND 150);
ALTER TABLE ticket_messages ADD CONSTRAINT ticket_messages_body CHECK (char_length(body) BETWEEN 1 AND 5000);
REVOKE DELETE, TRUNCATE ON TABLE support_tickets, ticket_messages FROM edusaas_app;
-- Archived report cards are written by the archival job (system role) and only read by the school.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE student_archives FROM edusaas_app;

-- Platform-only tables: the tenant-scoped app role has no business here (RLS on, no policy = no rows).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['plans', 'subscriptions', 'platform_permission_grants', 'audit_archives'] LOOP
    EXECUTE format('REVOKE ALL ON TABLE %I FROM edusaas_app', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
ALTER TABLE plans ADD CONSTRAINT plans_limits CHECK ((max_students IS NULL OR max_students > 0) AND (max_staff IS NULL OR max_staff > 0) AND price_monthly >= 0);
ALTER TABLE audit_archives ADD CONSTRAINT audit_archives_month CHECK (month ~ '^[0-9]{4}-[0-9]{2}$');

-- ── Audit archival (spec §10.3, plan §7) ─────────────────────────────────────
-- audit_logs stays insert-only for every runtime role. The only way rows leave is this function, which deletes a
-- school's month ONLY after its archive file has been recorded, and never the current month. It runs with the
-- owner's rights (SECURITY DEFINER) and is executable by the system role alone.
CREATE OR REPLACE FUNCTION delete_archived_audit_month(p_tenant uuid, p_month text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  month_start timestamptz := to_timestamp(p_month || '-01', 'YYYY-MM-DD') AT TIME ZONE 'UTC';
  month_end timestamptz := (to_timestamp(p_month || '-01', 'YYYY-MM-DD') + interval '1 month') AT TIME ZONE 'UTC';
  n integer;
BEGIN
  IF p_month !~ '^[0-9]{4}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'bad month %', p_month;
  END IF;
  IF month_end > date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' THEN
    RAISE EXCEPTION 'cannot delete the current month';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM audit_archives WHERE tenant_id IS NOT DISTINCT FROM p_tenant AND month = p_month) THEN
    RAISE EXCEPTION 'no archive recorded for % %', p_tenant, p_month;
  END IF;
  DELETE FROM audit_logs
   WHERE tenant_id IS NOT DISTINCT FROM p_tenant AND created_at >= month_start AND created_at < month_end;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION delete_archived_audit_month(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_archived_audit_month(uuid, text) TO edusaas_system;
