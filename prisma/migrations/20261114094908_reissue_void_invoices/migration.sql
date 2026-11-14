-- DropIndex
DROP INDEX "invoices_student_id_period_key";

-- CreateIndex
CREATE INDEX "invoices_student_id_period_idx" ON "invoices"("student_id", "period");


-- One live bill per student per month. Cancelled (VOID) bills are left out so the month can be billed again.
-- Hand-written: Prisma cannot model a partial unique index (scripts/new-migration.sh keeps diffs from dropping it).
CREATE UNIQUE INDEX "invoices_student_period_live" ON "invoices"("student_id", "period") WHERE status <> 'VOID';
