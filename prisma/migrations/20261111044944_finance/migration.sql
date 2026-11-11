-- CreateEnum
CREATE TYPE "FeeKind" AS ENUM ('MONTHLY', 'TERM', 'ONCE');

-- CreateEnum
CREATE TYPE "DiscountKind" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "LateFeeKind" AS ENUM ('FIXED', 'PERCENT', 'PER_DAY');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DUE', 'PARTIAL', 'PAID', 'WAIVED', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK', 'JAZZCASH', 'EASYPAISA', 'CHEQUE');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'FINALISED', 'PAID');

-- CreateEnum
CREATE TYPE "LedgerKind" AS ENUM ('FEE', 'ADVANCE', 'EXPENSE', 'SALARY', 'REVERSAL');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "SequenceKind" AS ENUM ('RECEIPT', 'INVOICE', 'VOUCHER', 'PAYSLIP');

-- CreateEnum
CREATE TYPE "PerDayDeduction" AS ENUM ('BASIC_30', 'NONE');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'ACCOUNTANT';

-- AlterTable
ALTER TABLE "leave_types" ADD COLUMN     "paid" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "fee_due_days" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "invoice_day" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "receipt_footer" TEXT,
ADD COLUMN     "term_start_months" INTEGER[] DEFAULT ARRAY[4, 9, 1]::INTEGER[];

-- CreateTable
CREATE TABLE "fee_heads" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "FeeKind" NOT NULL DEFAULT 'MONTHLY',
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_heads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_structures" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "fee_head_id" UUID NOT NULL,
    "amount_paisa" BIGINT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_fee_overrides" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "fee_head_id" UUID NOT NULL,
    "amount_paisa" BIGINT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_fee_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_discounts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "fee_head_id" UUID,
    "kind" "DiscountKind" NOT NULL,
    "value" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "late_fee_rules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "grace_days" INTEGER NOT NULL DEFAULT 0,
    "kind" "LateFeeKind" NOT NULL DEFAULT 'FIXED',
    "value" INTEGER NOT NULL DEFAULT 0,
    "cap_paisa" BIGINT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "late_fee_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "issued_on" DATE NOT NULL,
    "due_on" DATE NOT NULL,
    "subtotal_paisa" BIGINT NOT NULL,
    "discount_paisa" BIGINT NOT NULL DEFAULT 0,
    "late_fee_paisa" BIGINT,
    "late_fee_waived" BOOLEAN NOT NULL DEFAULT false,
    "paid_paisa" BIGINT NOT NULL DEFAULT 0,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DUE',
    "generated_by" UUID,
    "void_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "fee_head_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "amount_paisa" BIGINT NOT NULL,
    "discount_paisa" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "invoice_id" UUID,
    "amount_paisa" BIGINT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "received_on" DATE NOT NULL,
    "received_by" UUID NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "proof_key" TEXT,
    "note" TEXT,
    "client_key" UUID,
    "reversed_by_payment_id" UUID,
    "reverses_payment_id" UUID,
    "reversal_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_claims" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount_paisa" BIGINT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT NOT NULL,
    "paid_on" DATE NOT NULL,
    "proof_key" TEXT,
    "status" "ClaimStatus" NOT NULL DEFAULT 'PENDING',
    "decided_by" UUID,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "payment_id" UUID,
    "client_key" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "amount_paisa" BIGINT NOT NULL,
    "spent_on" DATE NOT NULL,
    "paid_to" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "voucher_number" TEXT NOT NULL,
    "reference" TEXT,
    "receipt_key" TEXT,
    "note" TEXT,
    "entered_by" UUID NOT NULL,
    "client_key" UUID,
    "reversed_by_expense_id" UUID,
    "reverses_expense_id" UUID,
    "reversal_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_structures" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "basic_paisa" BIGINT NOT NULL,
    "allowances" JSONB NOT NULL DEFAULT '[]',
    "deductions" JSONB NOT NULL DEFAULT '[]',
    "effective_from" DATE NOT NULL,
    "per_day_deduction" "PerDayDeduction" NOT NULL DEFAULT 'BASIC_30',
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "total_paisa" BIGINT NOT NULL DEFAULT 0,
    "run_by" UUID NOT NULL,
    "finalised_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "payroll_run_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "basic_paisa" BIGINT NOT NULL,
    "allowances" JSONB NOT NULL DEFAULT '[]',
    "deductions" JSONB NOT NULL DEFAULT '[]',
    "allowances_paisa" BIGINT NOT NULL DEFAULT 0,
    "deductions_paisa" BIGINT NOT NULL DEFAULT 0,
    "unpaid_leave_days" INTEGER NOT NULL DEFAULT 0,
    "leave_deduction_paisa" BIGINT NOT NULL DEFAULT 0,
    "net_paisa" BIGINT NOT NULL,
    "paid_on" DATE,
    "method" "PaymentMethod",
    "reference" TEXT,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "entry_on" DATE NOT NULL,
    "kind" "LedgerKind" NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount_paisa" BIGINT NOT NULL,
    "method" "PaymentMethod",
    "ref_table" TEXT NOT NULL,
    "ref_id" UUID NOT NULL,
    "student_id" UUID,
    "user_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_sequences" (
    "tenant_id" UUID NOT NULL,
    "kind" "SequenceKind" NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "finance_sequences_pkey" PRIMARY KEY ("tenant_id","kind")
);

-- CreateIndex
CREATE UNIQUE INDEX "fee_heads_tenant_id_name_key" ON "fee_heads"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "fee_structures_tenant_id_idx" ON "fee_structures"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_structures_academic_year_id_class_id_fee_head_id_key" ON "fee_structures"("academic_year_id", "class_id", "fee_head_id");

-- CreateIndex
CREATE INDEX "student_fee_overrides_tenant_id_idx" ON "student_fee_overrides"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_fee_overrides_student_id_fee_head_id_key" ON "student_fee_overrides"("student_id", "fee_head_id");

-- CreateIndex
CREATE INDEX "fee_discounts_tenant_id_student_id_idx" ON "fee_discounts"("tenant_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "late_fee_rules_academic_year_id_key" ON "late_fee_rules"("academic_year_id");

-- CreateIndex
CREATE INDEX "late_fee_rules_tenant_id_idx" ON "late_fee_rules"("tenant_id");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_status_due_on_idx" ON "invoices"("tenant_id", "status", "due_on");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_period_idx" ON "invoices"("tenant_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_student_id_period_key" ON "invoices"("student_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenant_id_number_key" ON "invoices"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "invoice_lines_tenant_id_idx" ON "invoice_lines"("tenant_id");

-- CreateIndex
CREATE INDEX "invoice_lines_invoice_id_idx" ON "invoice_lines"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_reversed_by_payment_id_key" ON "payments"("reversed_by_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_reverses_payment_id_key" ON "payments"("reverses_payment_id");

-- CreateIndex
CREATE INDEX "payments_tenant_id_received_on_idx" ON "payments"("tenant_id", "received_on");

-- CreateIndex
CREATE INDEX "payments_student_id_idx" ON "payments"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenant_id_receipt_number_key" ON "payments"("tenant_id", "receipt_number");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenant_id_client_key_key" ON "payments"("tenant_id", "client_key");

-- CreateIndex
CREATE INDEX "payment_claims_tenant_id_status_created_at_idx" ON "payment_claims"("tenant_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_claims_tenant_id_client_key_key" ON "payment_claims"("tenant_id", "client_key");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_tenant_id_name_key" ON "expense_categories"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_reversed_by_expense_id_key" ON "expenses"("reversed_by_expense_id");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_reverses_expense_id_key" ON "expenses"("reverses_expense_id");

-- CreateIndex
CREATE INDEX "expenses_tenant_id_spent_on_idx" ON "expenses"("tenant_id", "spent_on");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_tenant_id_voucher_number_key" ON "expenses"("tenant_id", "voucher_number");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_tenant_id_client_key_key" ON "expenses"("tenant_id", "client_key");

-- CreateIndex
CREATE INDEX "salary_structures_tenant_id_idx" ON "salary_structures"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "salary_structures_user_id_key" ON "salary_structures"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_tenant_id_period_key" ON "payroll_runs"("tenant_id", "period");

-- CreateIndex
CREATE INDEX "payslips_tenant_id_user_id_idx" ON "payslips"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_payroll_run_id_user_id_key" ON "payslips"("payroll_run_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_tenant_id_number_key" ON "payslips"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "ledger_entries_tenant_id_entry_on_idx" ON "ledger_entries"("tenant_id", "entry_on");

-- CreateIndex
CREATE INDEX "ledger_entries_tenant_id_student_id_idx" ON "ledger_entries"("tenant_id", "student_id");

-- CreateIndex
CREATE INDEX "ledger_entries_tenant_id_kind_entry_on_idx" ON "ledger_entries"("tenant_id", "kind", "entry_on");

-- AddForeignKey
ALTER TABLE "fee_heads" ADD CONSTRAINT "fee_heads_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_fee_head_id_fkey" FOREIGN KEY ("fee_head_id") REFERENCES "fee_heads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_overrides" ADD CONSTRAINT "student_fee_overrides_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_overrides" ADD CONSTRAINT "student_fee_overrides_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_overrides" ADD CONSTRAINT "student_fee_overrides_fee_head_id_fkey" FOREIGN KEY ("fee_head_id") REFERENCES "fee_heads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_discounts" ADD CONSTRAINT "fee_discounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_discounts" ADD CONSTRAINT "fee_discounts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_discounts" ADD CONSTRAINT "fee_discounts_fee_head_id_fkey" FOREIGN KEY ("fee_head_id") REFERENCES "fee_heads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "late_fee_rules" ADD CONSTRAINT "late_fee_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "late_fee_rules" ADD CONSTRAINT "late_fee_rules_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_fee_head_id_fkey" FOREIGN KEY ("fee_head_id") REFERENCES "fee_heads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_reverses_payment_id_fkey" FOREIGN KEY ("reverses_payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_claims" ADD CONSTRAINT "payment_claims_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_claims" ADD CONSTRAINT "payment_claims_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_claims" ADD CONSTRAINT "payment_claims_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_claims" ADD CONSTRAINT "payment_claims_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_reverses_expense_id_fkey" FOREIGN KEY ("reverses_expense_id") REFERENCES "expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_payroll_run_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_sequences" ADD CONSTRAINT "finance_sequences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- ── Security ─────────────────────────────────────────────────────────────────
-- Tenant-owned: school users see only their own rows (RLS) and the database rejects cross-tenant references.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'fee_heads', 'fee_structures', 'student_fee_overrides', 'fee_discounts', 'late_fee_rules',
    'invoices', 'invoice_lines', 'payments', 'payment_claims',
    'expense_categories', 'expenses', 'salary_structures', 'payroll_runs', 'payslips',
    'ledger_entries', 'finance_sequences'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I TO edusaas_app USING (tenant_id = (SELECT app_current_tenant())) WITH CHECK (tenant_id = (SELECT app_current_tenant()))', t);
  END LOOP;
END $$;

CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON fee_structures
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('academic_year_id', 'academic_years', 'class_id', 'classes', 'fee_head_id', 'fee_heads');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON student_fee_overrides
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('student_id', 'students', 'fee_head_id', 'fee_heads');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON fee_discounts
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('student_id', 'students', 'fee_head_id', 'fee_heads');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON late_fee_rules
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('academic_year_id', 'academic_years');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('student_id', 'students', 'academic_year_id', 'academic_years');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON invoice_lines
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('invoice_id', 'invoices', 'fee_head_id', 'fee_heads');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('student_id', 'students', 'invoice_id', 'invoices', 'reverses_payment_id', 'payments');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON payment_claims
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('student_id', 'students', 'invoice_id', 'invoices', 'payment_id', 'payments');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('category_id', 'expense_categories', 'reverses_expense_id', 'expenses');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON salary_structures
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('user_id', 'users');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON payslips
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('payroll_run_id', 'payroll_runs', 'user_id', 'users');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('student_id', 'students');

-- Money rules the database enforces regardless of application code.
ALTER TABLE fee_structures ADD CONSTRAINT fee_structures_amount CHECK (amount_paisa >= 0);
ALTER TABLE student_fee_overrides ADD CONSTRAINT student_fee_overrides_amount CHECK (amount_paisa >= 0);
ALTER TABLE fee_discounts ADD CONSTRAINT fee_discounts_value CHECK (value >= 0 AND (kind <> 'PERCENT' OR value <= 10000));
ALTER TABLE late_fee_rules ADD CONSTRAINT late_fee_rules_value CHECK (grace_days >= 0 AND value >= 0 AND (cap_paisa IS NULL OR cap_paisa >= 0));
ALTER TABLE invoices ADD CONSTRAINT invoices_period CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2]|T[1-3]|ONCE-[0-9a-f-]{36})$');
ALTER TABLE invoices ADD CONSTRAINT invoices_amounts CHECK (subtotal_paisa >= 0 AND discount_paisa >= 0 AND paid_paisa >= 0 AND (late_fee_paisa IS NULL OR late_fee_paisa >= 0));
ALTER TABLE invoice_lines ADD CONSTRAINT invoice_lines_amounts CHECK (amount_paisa >= 0 AND discount_paisa >= 0 AND discount_paisa <= amount_paisa);
ALTER TABLE payments ADD CONSTRAINT payments_amount CHECK (amount_paisa <> 0 AND (amount_paisa > 0 OR reverses_payment_id IS NOT NULL));
ALTER TABLE payment_claims ADD CONSTRAINT payment_claims_amount CHECK (amount_paisa > 0);
ALTER TABLE expenses ADD CONSTRAINT expenses_amount CHECK (amount_paisa <> 0 AND (amount_paisa > 0 OR reverses_expense_id IS NOT NULL));
ALTER TABLE salary_structures ADD CONSTRAINT salary_structures_basic CHECK (basic_paisa >= 0);
ALTER TABLE payroll_runs ADD CONSTRAINT payroll_runs_period CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE payslips ADD CONSTRAINT payslips_amounts CHECK (basic_paisa >= 0 AND unpaid_leave_days >= 0 AND leave_deduction_paisa >= 0);
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_amount CHECK (amount_paisa > 0);
ALTER TABLE finance_sequences ADD CONSTRAINT finance_sequences_next CHECK (next >= 1);

-- Money rows are never deleted by the app; corrections are reversals. The ledger is append-only.
REVOKE DELETE, TRUNCATE ON TABLE invoices, invoice_lines, payments, payment_claims, expenses, payslips FROM edusaas_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE ledger_entries FROM edusaas_app;

CREATE OR REPLACE FUNCTION ledger_entries_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append-only' USING ERRCODE = 'restrict_violation';
END $$;
CREATE TRIGGER ledger_entries_immutable BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION ledger_entries_immutable();
