-- AlterEnum
ALTER TYPE "MarksPublisher" ADD VALUE 'TEACHER';

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'CLERK';

-- AlterTable
ALTER TABLE "assessments" ADD COLUMN     "chapter" TEXT,
ADD COLUMN     "details" TEXT;

-- CreateTable
CREATE TABLE "payment_accounts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "label" TEXT NOT NULL,
    "account_title" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "iban" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_accounts_tenant_id_method_idx" ON "payment_accounts"("tenant_id", "method");

-- AddForeignKey
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Tenant-owned, like every other school table.
ALTER TABLE payment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payment_accounts TO edusaas_app
  USING (tenant_id = (SELECT app_current_tenant())) WITH CHECK (tenant_id = (SELECT app_current_tenant()));
