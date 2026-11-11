# Finance Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fees, payments, parent payment claims, expenses, payroll, an insert-only ledger and finance reports to EDUsaas, with a new Accountant role, on the existing Next.js + Prisma + RLS stack.

**Architecture:** New tenant-scoped Prisma models with the same RLS policy, same-tenant triggers and grants as every other table; money as BIGINT paisa; gap-free numbering from a row-locked `finance_sequences` table; every money movement also writes an insert-only `ledger_entries` row that reports read from. Services under `src/server/school/finance/`, routes under `src/app/api/v1/`, web pages under `src/app/staff/(app)/finance/` and `src/app/student/(app)/fees/`.

**Tech Stack:** Next.js 15 App Router, Prisma 6, Postgres 16 with RLS, zod 4, pdf-lib, Vitest 3, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-11-finance-and-android-design.md` (section 2). The Android app (section 3) is a separate plan written after this one ships.

## Global Constraints

- Money is `BigInt` paisa in the DB and services; API JSON carries `amountPaisa: number` (integers, safe up to 2^53); UI formats `PKR 12,345.50`.
- Every new table: `tenant_id`, RLS policy `tenant_isolation`, `enforce_same_tenant` trigger for each FK to another tenant table, `REVOKE DELETE, TRUNCATE … FROM edusaas_app` on money tables (`payments`, `expenses`, `ledger_entries`, `payslips`), `ledger_entries` also `REVOKE UPDATE`. `npm run db:check-rls` must pass.
- Payments and expenses are never deleted; corrections are reversals (negative mirror row, both linked).
- Numbers `R-`, `I-`, `V-`, `P-` + 6 digits, per school, gap-free: allocate inside the same transaction as the insert with `SELECT … FOR UPDATE` on `finance_sequences`.
- `clientKey` (UUID) on `POST /payments`, `POST /expenses`, `POST /me/fees/claims`: unique `(tenant_id, client_key)`; a repeat returns the first result with `duplicate: true`, status 200.
- Only `src/server/{auth,platform,audit,jobs,db}` may import `systemDb` (lint rule). Finance services use `inTenant(ctx, …)`.
- Every new route export appears in `tests/integration/authz.test.ts` MATRIX (route-coverage test enforces it). New role ACCOUNTANT is added to `ROLES` there and to `Fixtures['a']`.
- Follow existing patterns: `defineRoute`, `audit(ctx, tx, …)`, `notify(tx, tenantId, userIds, …)`, `friendlyDbError`, `EmptyState`, `PageHeader`, `Panel`, prettier + eslint clean.
- Migrations via `npm run db:new-migration -- <name>` then hand-edit for RLS/grants/triggers.

## Review Focus

1. Two accountants record a payment for the same invoice at the same instant → both receipts exist with distinct consecutive numbers, invoice `paid_paisa` is the sum, status correct (Task 5 concurrency test).
2. Payment larger than the outstanding balance → refused with 422 "exceeds balance" unless `allowAdvance: true`, in which case the excess becomes an advance (Task 5).
3. Invoice generated for a student who transfers class mid-month → the month already invoiced is kept; next month uses the new class (Task 4 test).
4. Reversal of a payment on a `PAID` invoice that had a frozen late fee → invoice goes back to `PARTIAL`/`DUE`, late fee recomputed live again (Task 5).
5. Payroll run for a month where a staff member joined mid-month or has no salary structure → no payslip for them; unpaid-leave days count only working days inside the month (Task 8).

---

### Task 1: Role, permissions, schema and migration

**Files:**

- Modify: `prisma/schema.prisma` (enum `UserRole` + `ACCOUNTANT`; new enums `FeeKind`, `DiscountKind`, `LateFeeKind`, `InvoiceStatus`, `PaymentMethod`, `ClaimStatus`, `PayrollStatus`, `LedgerKind`, `LedgerDirection`, `SequenceKind`; models from spec §2.2; `LeaveType.paid`; `SchoolSettings.invoiceDay`, `feeDueDays`, `receiptFooter`, `termStartMonths Int[] @default([4,9,1])`)
- Create: `prisma/migrations/<ts>_finance/migration.sql`
- Modify: `src/server/authz/permissions.ts` (PERMISSIONS + ROLE_POLICIES: ACCOUNTANT fixed list; PRINCIPAL configurable `'finance.read': true`; STUDENT fixed `+ 'self.fees'`; SCHOOL_ADMIN_PERMISSIONS already picks up all non-platform permissions — exclude `self.fees` there)
- Modify: `src/server/auth/portals.ts` (ACCOUNTANT in STAFF portal and `EMAIL_ROLES`), `src/components/ui.tsx` ROLE_LABELS (`ACCOUNTANT: 'Accountant'`), `src/server/school/users.ts:10` and `src/server/school/people.ts:325` role enums (`createStaffSchema` accepts `ACCOUNTANT`), `src/components/people/StaffAccounts.tsx` role filter/picker, `src/app/staff/(app)/users/page.tsx` tabs.
- Modify: `scripts/check-rls.ts` (nothing to add if every new table has `tenant_id`; run it).
- Test: `tests/unit/permissions.test.ts`, `tests/integration/rls.test.ts`

**Interfaces:**

- Produces: Prisma models `FeeHead, FeeStructure, StudentFeeOverride, FeeDiscount, LateFeeRule, Invoice, InvoiceLine, Payment, PaymentClaim, ExpenseCategory, Expense, SalaryStructure, PayrollRun, Payslip, LedgerEntry, FinanceSequence`; permissions `'fees.manage' | 'fees.collect' | 'expenses.manage' | 'payroll.manage' | 'finance.read' | 'self.fees'`.

- [ ] **Step 1: Write failing unit test** in `tests/unit/permissions.test.ts`:

```ts
it('ACCOUNTANT gets finance + student lookup only', () => {
  const p = effectivePermissions('ACCOUNTANT');
  expect([...p].sort()).toEqual([
    'expenses.manage',
    'fees.collect',
    'fees.manage',
    'finance.read',
    'payroll.manage',
    'students.read',
    'students.search',
  ]);
});
it('PRINCIPAL finance.read is a toggle, default on; STUDENT has self.fees', () => {
  expect(effectivePermissions('PRINCIPAL').has('finance.read')).toBe(true);
  expect(effectivePermissions('PRINCIPAL', { 'finance.read': false }).has('finance.read')).toBe(false);
  expect(effectivePermissions('STUDENT').has('self.fees')).toBe(true);
  expect(effectivePermissions('TEACHER').has('finance.read')).toBe(false);
});
```

- [ ] **Step 2: Run** `npx vitest run --project unit tests/unit/permissions.test.ts` → FAIL (ACCOUNTANT not a UserRole / permissions missing).
- [ ] **Step 3: Edit schema.prisma** per spec §2.2. Column names snake_case via `@map`, tables via `@@map`. Unique: `fee_heads(tenant_id,name)`, `fee_structures(academic_year_id,class_id,fee_head_id)`, `invoices(student_id,period)`, `invoices(tenant_id,number)`, `payments(tenant_id,receipt_number)`, `payments(tenant_id,client_key)`, `expenses(tenant_id,client_key)`, `payment_claims(tenant_id,client_key)`, `payroll_runs(tenant_id,period)`, `payslips(payroll_run_id,user_id)`, `finance_sequences(tenant_id,kind)`. Indexes: `invoices(tenant_id,status,due_on)`, `payments(tenant_id,received_on)`, `ledger_entries(tenant_id,entry_on)`, `ledger_entries(tenant_id,student_id)`.
- [ ] **Step 4: Generate migration** `npm run db:new-migration -- finance`, then append to the SQL: RLS enable + `tenant_isolation` policy for each new table (copy the `DO $$ … EXECUTE format(…)` loop from the archival migration), `same_tenant` triggers (invoice→student/academic_year; invoice_lines→invoice/fee_head; payments→student/invoice; payment_claims→student/invoice; fee_structures→academic_year/class/fee_head; student_fee_overrides→student/fee_head; fee_discounts→student; expenses→category; payslips→payroll_run/user; salary_structures→user; ledger_entries→student?/user?), CHECK constraints (`amount_paisa >= 0` on structures/lines/claims/invoices; `period ~ '^[0-9]{4}-(0[1-9]|1[0-2]|T[1-3]|ONCE-.+)$'`; payments allow negative only when `reversed_by_payment_id IS NOT NULL OR amount_paisa < 0 AND reverses_payment_id IS NOT NULL` — model it as two nullable columns `reverses_payment_id`, `reversed_by_payment_id`), REVOKEs listed in Global Constraints, and a trigger `ledger_entries_immutable` raising on UPDATE/DELETE.
- [ ] **Step 5: Permissions + role plumbing** (files listed above). `PERMISSIONS` labels: `'fees.manage': 'Set up fee heads, amounts and discounts'`, `'fees.collect': 'Generate invoices, take payments, confirm payment proofs'`, `'expenses.manage': 'Record school expenses'`, `'payroll.manage': 'Salary structures and monthly payroll'`, `'finance.read': 'View finance reports and ledgers'`, `'self.fees': 'View own fee bills and submit payment proof'`.
- [ ] **Step 6: Run** `npx prisma migrate deploy && npx prisma generate && npm run db:check-rls && npm run typecheck && npx vitest run --project unit tests/unit/permissions.test.ts` → all pass, check-rls lists the 16 new tables as protected.
- [ ] **Step 7: Add RLS test** in `tests/integration/rls.test.ts`: School A session inserting a `fee_heads` row with School B's `tenant_id` is rejected; `ledger_entries` UPDATE raises. Run `npx vitest run --project integration tests/integration/rls.test.ts` → PASS.
- [ ] **Step 8: Fixtures**: `tests/integration/helpers/fixtures.ts` adds `a.ACCOUNTANT` (email `accounts-a@…`), and `authz.test.ts` `ROLES` + `actor()` include it. Existing MATRIX rows: ACCOUNTANT must be 403 everywhere except `auth/*`, `GET /students`, `GET /students/[id]`, `GET /search` (same as its permissions). Run `npm run test:integration` → PASS.
- [ ] **Step 9: Commit** `feat(finance): Accountant role, finance schema and RLS`.

### Task 2: Money and period helpers (shared later with mobile)

**Files:**

- Create: `src/lib/money.ts`, `src/lib/periods.ts`
- Test: `tests/unit/money.test.ts`

**Interfaces:**

- Produces: `formatPKR(paisa: number | bigint): string` → `"PKR 1,234.50"`; `toPaisa(rupees: string | number): number` (half-up to paisa; throws on NaN/negative); `amountInWords(paisa: number): string` → `"One thousand two hundred thirty-four rupees and fifty paisa only"`; `applyDiscount(amount: number, d: {kind:'PERCENT'|'FIXED'; value: number}): number` (percent half-up, never below 0, FIXED capped at amount); `lateFee(rule: {kind:'FIXED'|'PERCENT'|'PER_DAY'; value: number; capPaisa: number|null; graceDays: number}, base: number, dueOn: string, today: string): number`; `monthPeriod(iso: string): string` (`'2026-11'`); `termOf(month: number, termStartMonths: number[]): 1|2|3`; `periodLabel(period: string): string` (`'November 2026'`, `'Term 2 2026'`, `'One-time'`).

- [ ] **Step 1: Write tests**: `toPaisa('12.345') === 1235`, `toPaisa(-1)` throws; `formatPKR(123450) === 'PKR 1,234.50'`; `applyDiscount(100000, {kind:'PERCENT', value: 12.5}) === 12500`; `applyDiscount(1000,{kind:'FIXED',value:5000}) === 1000`; `lateFee({kind:'PER_DAY',value:5000,capPaisa:50000,graceDays:3}, 100000, '2026-11-10', '2026-11-30') === 50000` (17 days×50 capped at 500); `lateFee(..., '2026-11-12') === 0` (inside grace); `amountInWords(100050)` exact string; `termOf(1,[4,9,1]) === 3`, `termOf(9,[4,9,1]) === 2`.
- [ ] **Step 2: Run** → FAIL (module missing). **Step 3: Implement.** **Step 4: Run** → PASS. **Step 5: Commit** `feat(finance): money and period helpers`.

### Task 3: Fee setup services and routes

**Files:**

- Create: `src/server/school/finance/setup.ts`, routes `src/app/api/v1/fees/heads/route.ts`, `fees/heads/[id]/route.ts`, `fees/structures/route.ts`, `fees/late-fee/route.ts`, `students/[id]/fees/overrides/route.ts`, `students/[id]/fees/overrides/[overrideId]/route.ts`, `students/[id]/fees/discounts/route.ts`, `students/[id]/fees/discounts/[discountId]/route.ts`
- Modify: `src/lib/audit-labels.ts`, `src/server/school/auditlog.ts` (category `finance`: prefixes `fee_head.`, `fee_structure.`, `discount.`, `late_fee.`, `invoice.`, `payment.`, `claim.`, `expense.`, `payroll.`)
- Test: `tests/integration/finance-setup.test.ts`, MATRIX rows

**Interfaces:**

- Produces: `listFeeHeads(ctx)`, `createFeeHead(ctx, {name, kind})`, `updateFeeHead(ctx, id, {name?, archived?})`; `feeStructure(ctx, yearId)` → `{classes:[{id,name}], heads:[...], amounts:{[classId]:{[headId]:paisa}}}`; `saveFeeStructure(ctx, yearId, rows:[{classId, feeHeadId, amountPaisa}])` (upsert; 0 deletes); `lateFeeRule(ctx, yearId)` / `saveLateFeeRule(ctx, yearId, {graceDays, kind, value, capPaisa})`; `studentFeeConfig(ctx, studentId)` → `{overrides, discounts}`; `addOverride`, `removeOverride`, `addDiscount(ctx, studentId, {feeHeadId?, kind, value, reason, validFrom, validTo?})`, `endDiscount(ctx, studentId, id)` (sets validTo = today).
- Permission: `fees.manage` on all; GETs also allowed with `fees.collect` (use `anyPermission`).

- [ ] **Step 1: Tests** (integration, School A accountant): create head "Tuition" MONTHLY; duplicate name → 409; save structure for class 8 = 500000 → `feeStructure` returns it; save 0 removes it; discount PERCENT 50 for studentA; School B accountant cannot see A's heads (empty list) nor add discount to studentA (404); audit rows `fee_head.create`, `discount.add` exist.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** services with `inTenant` + `audit`; routes with `defineRoute({auth:'user', portals:['STAFF'], permission/anyPermission, …})`. **Step 4: Run** → PASS.
- [ ] **Step 5: MATRIX rows** for all 8 route files (ACCOUNTANT/SCHOOL_ADMIN 200, PRINCIPAL 403 on writes, 200 on GET structures only if `finance.read`… keep simple: GETs → ACCOUNTANT, SCHOOL_ADMIN; writes same). Run `npm run test:integration` → PASS.
- [ ] **Step 6: Commit** `feat(finance): fee heads, structures, discounts, late-fee rule`.

### Task 4: Invoices

**Files:**

- Create: `src/server/school/finance/invoices.ts`, `src/server/school/finance/sequences.ts`, routes `invoices/generate/route.ts`, `invoices/route.ts`, `invoices/[id]/route.ts`, `invoices/[id]/void/route.ts`, `invoices/[id]/waive-late-fee/route.ts`, `students/[id]/fees/route.ts`, `me/fees/route.ts`
- Test: `tests/integration/finance-invoices.test.ts`

**Interfaces:**

- Produces: `nextNumber(tx, tenantId, kind: 'RECEIPT'|'INVOICE'|'VOUCHER'|'PAYSLIP'): Promise<string>` (`'I-000001'`); `generateInvoices(tx, tenantId, {period, classId?, studentId?, by: userId|'JOB', clock})` → `{created: number, skipped: number}` (pure tx function so the cron can call it with `systemDb` via `withTenant`); `generateInvoicesFor(ctx, input)` wrapper; `listInvoices(ctx, {status?, classId?, period?, q?, page?})`; `invoiceDetail(ctx, id)` → invoice + lines + payments + `liveLateFeePaisa` + `balancePaisa`; `voidInvoice(ctx, id, reason)`; `waiveLateFee(ctx, id, reason)`; `studentFees(ctx, studentId)` → `{outstandingPaisa, advancePaisa, invoices:[…], payments:[…], claims:[…]}`; `myFees(ctx)` (student → own). `invoiceTotals(inv, clock, rule)` pure helper → `{subtotal, discount, lateFee, total, paid, balance, status}`.
- Line amounts: structure amount → override if present → discounts (student-level `feeHeadId null` applies to every line; specific overrides general; only one discount per line, the most specific) using `applyDiscount`.

- [ ] **Step 1: Tests**: generate `2026-11` for class 8 creates one invoice per active placed student with lines Tuition 500000 (studentA with 50% discount → discount 250000); running again → `created: 0`; `DUE` status; `invoiceDetail` live late fee after due + grace (freeze clock via `schoolClock` override: use a `today` param); void before payment OK, void after payment → 409; `myFees` as studentA shows 1 invoice, as School B student shows none; invoice numbers consecutive `I-000001`, `I-000002`; **Review Focus 3**: transfer studentA to class 9 then generate `2026-12` → new invoice uses class 9 structure, November invoice unchanged.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. **Step 5: MATRIX** rows (`me/fees` STUDENT 200 others 403; staff routes ACCOUNTANT+SCHOOL_ADMIN; `GET /invoices` also PRINCIPAL via `finance.read`). **Step 6: Commit** `feat(finance): invoices and numbering`.

### Task 5: Payments, receipts, reversals, ledger

**Files:**

- Create: `src/server/school/finance/payments.ts`, `src/server/school/finance/ledger.ts`, `src/server/school/finance/receipt-pdf.ts`, routes `payments/route.ts`, `payments/[id]/receipt.pdf/route.ts` (file `payments/[id]/receipt/route.ts` returning `application/pdf`), `payments/[id]/reverse/route.ts`
- Test: `tests/integration/finance-payments.test.ts`

**Interfaces:**

- Produces: `postLedger(tx, {tenantId, entryOn, kind, direction, amountPaisa, method?, refTable, refId, studentId?, userId?, createdBy})`; `recordPayment(ctx, {invoiceId?, studentId, amountPaisa, method, reference?, receivedOn, note?, clientKey, allowAdvance?})` → `{payment, receiptNumber, invoice?, duplicate: boolean}`; `reversePayment(ctx, id, reason)` → `{reversal}`; `receiptPdf(ctx, paymentId)` → `Uint8Array` (student may fetch own); `applyAdvances(tx, tenantId, studentId)` (called after generation).
- Rules from spec §2.3; refuse `amountPaisa <= 0`; payment on `VOID`/`PAID` invoice → 409.

- [ ] **Step 1: Tests**: pay 300000 of 250000-balance invoice → 422 "exceeds balance"; same with `allowAdvance` → invoice PAID, advance ledger 50000; partial 100000 → `PARTIAL`, receipt `R-000001`; **concurrency (Review Focus 1)**: `Promise.all` of 10 payments of 10000 each on one invoice → 10 distinct receipt numbers `R-000001..R-000010`, `paid_paisa === 100000`; duplicate `clientKey` → same receipt, `duplicate: true`; reversal → invoice back to DUE, ledger has `REVERSAL` OUT entry, original payment has `reversed_by_payment_id`; reversing twice → 409; **Review Focus 4** late-fee freeze lifted; `receiptPdf` starts with `%PDF-`; studentA can fetch own receipt, School B student 404; `DELETE` on payments table as app role fails (RLS test).
- [ ] **Step 2–4**: FAIL → implement → PASS. **Step 5: MATRIX** (`POST /payments` ACCOUNTANT+SCHOOL_ADMIN; receipt STUDENT 200 for own, ACCOUNTANT 200, TEACHER 403). **Step 6: Commit** `feat(finance): payments, receipts, reversals, ledger`.

### Task 6: Payment claims (parent proof)

**Files:**

- Create: `src/server/school/finance/claims.ts`, routes `me/fees/claims/route.ts` (GET, POST multipart: fields + `proof` file), `fees/claims/route.ts`, `fees/claims/[id]/route.ts` (GET: detail + proof image), `fees/claims/[id]/decide/route.ts`
- Test: `tests/integration/finance-claims.test.ts`

**Interfaces:**

- Produces: `submitClaim(ctx, {invoiceId, amountPaisa, method, reference, paidOn, clientKey, proof: {bytes, type}})`; `listClaims(ctx, status)`; `decideClaim(ctx, id, {decision:'CONFIRM'|'REJECT', note?})` → on CONFIRM calls `recordPayment` with method/reference from the claim and `receivedOn = paidOn`; `claimProof(ctx, id)` → `{bytes, type}` (accountant or the owning student).
- Proof: reuse `sniffImage`/size rules from `src/server/school/photos.ts` (export them), key `finance/{prefix}/claims/{claimId}.{ext}`, `STORAGE_MISSING` → 503 with the existing "storage not set up" message.

- [ ] **Step 1: Tests**: student submits claim with jpeg → `PENDING`, notification to accountants `claim.submitted`; claim > balance → 422; accountant confirms → payment + receipt, claim `CONFIRMED`, student notified with receipt link; reject with note → student notified; duplicate clientKey idempotent; School B accountant cannot see/decide (404).
- [ ] **Steps 2–5** as before. **Step 6: Commit** `feat(finance): parent payment claims`.

### Task 7: Expenses

**Files:**

- Create: `src/server/school/finance/expenses.ts`, `voucher-pdf.ts`, routes `expenses/categories/route.ts`, `expenses/categories/[id]/route.ts`, `expenses/route.ts`, `expenses/[id]/reverse/route.ts`, `expenses/[id]/voucher/route.ts`
- Test: `tests/integration/finance-expenses.test.ts`

**Interfaces:**

- Produces: `listCategories`, `createCategory`, `updateCategory(archive)`; `listExpenses(ctx, {from, to, categoryId?})`; `recordExpense(ctx, {categoryId, amountPaisa, spentOn, paidTo, method, reference?, note?, clientKey, receipt?})` → voucher `V-000001` + ledger `EXPENSE OUT`; `reverseExpense(ctx, id, reason)`; `voucherPdf(ctx, id)`. System category `Salaries` created lazily by payroll (flag `system: true`, not archivable).

- [ ] Tests: record → voucher number, ledger OUT; reverse → mirror + ledger; archive category with expenses still lists history; cross-tenant 404; MATRIX. Commit `feat(finance): expenses and vouchers`.

### Task 8: Payroll

**Files:**

- Create: `src/server/school/finance/payroll.ts`, `payslip-pdf.ts`, routes `payroll/structures/[userId]/route.ts`, `payroll/runs/route.ts`, `payroll/runs/[id]/route.ts` (GET, DELETE draft), `payroll/runs/[id]/finalise/route.ts`, `payroll/runs/[id]/pay/route.ts`, `payslips/[id]/route.ts` (PDF), `me/payslips/route.ts`
- Modify: `src/server/school/leave.ts` (leave type `paid` in schemas/UI), `src/components/leave/LeaveTypesEditor.tsx`
- Test: `tests/integration/finance-payroll.test.ts`

**Interfaces:**

- Produces: `salaryStructure(ctx, userId)`, `saveSalaryStructure(ctx, userId, {basicPaisa, allowances:[{name, amountPaisa}], deductions:[…], effectiveFrom, perDayDeduction:'BASIC_30'|'NONE'})`; `createPayrollRun(ctx, period)` → draft with payslips for every active non-student user with a structure effective on/before month end; `unpaidLeaveDays(tx, userId, period, clock)` (approved, unpaid type, working days only); `finaliseRun`, `payRun(ctx, id, {payslipIds?, paidOn, method, reference?})` → `SALARY OUT` ledger per slip + `Salaries` expense total row; `deleteDraftRun`; `payslipPdf(ctx, id)` (own or `payroll.manage`); `myPayslips(ctx)`.

- [ ] Tests: structure basic 3000000 + allowance 500000 − deduction 100000; teacher takes 2 days approved unpaid leave in month → payslip `leaveDeductionPaisa = 2 × 3000000/30 = 200000`, `netPaisa = 3200000`; **Review Focus 5**: staff without structure gets no payslip; run twice same period → 409; delete finalised → 409; pay → ledger entries sum equals run total; teacher can read own payslip PDF, not another's (404); MATRIX. Commit `feat(finance): payroll and payslips`.

### Task 9: Reports, overview, jobs, seed

**Files:**

- Create: `src/server/school/finance/reports.ts`, `src/server/school/finance/overview.ts`, `src/server/jobs/finance.ts`, routes `finance/reports/[report]/route.ts` (report ∈ daily|defaulters|income-expense|summary|student-ledger; `?format=json|csv|pdf`), `finance/overview/route.ts`
- Modify: `src/server/jobs/daily.ts` (steps `invoicesGenerate`, `feeReminders`, `advancesApply` after `studentsAnonymized`), `tests/integration/hardening.test.ts` cron key list, `prisma/seed.ts` (`seedFinance()` per spec §2.7), `src/server/school/settings.ts` (+ `invoiceDay`, `feeDueDays`, `receiptFooter`, `termStartMonths`)
- Test: `tests/integration/finance-reports.test.ts`, `tests/integration/finance-jobs.test.ts`

**Interfaces:**

- Produces: `dailyCollection(ctx, {from, to})`, `defaulters(ctx, {classId?, asOf})`, `incomeExpense(ctx, yearId)`, `monthSummary(ctx, period)`, `studentLedger(ctx, studentId)`; each returns rows + totals; `toCsv(rows)` reuses the formula-neutralising helper in `src/server/school/reports.ts` (export it); `financeOverview(ctx)` → `{collectedTodayPaisa, outstandingPaisa, defaulters, claimsPending, monthInvoicedPaisa, monthCollectedPaisa, monthExpensesPaisa}`; jobs `generateMonthlyInvoices(now)`, `sendFeeReminders(now)`, `applyPendingAdvances(now)` (each loops tenants with `withTenant`, idempotent, returns counts).

- [ ] Tests: after Tasks 4–8 fixtures, `monthSummary` numbers equal sums over `ledger_entries` for the month; `defaulters` excludes PAID and withdrawn; CSV first cell with `=` is neutralised; job on `invoiceDay` creates invoices once per school and `feeReminders` creates exactly one `fee.due_soon` notification per invoice even when run twice; cron key list includes the three new steps.
- [ ] Seed runs (`npm run db:seed`) and produces accountant `accounts@bss.test`. Commit `feat(finance): reports, overview, jobs, seed`.

### Task 10: Web UI — staff Finance group

**Files:**

- Create: `src/app/staff/(app)/finance/page.tsx` (overview), `finance/collect/page.tsx`, `finance/invoices/page.tsx`, `finance/invoices/[id]/page.tsx`, `finance/claims/page.tsx`, `finance/setup/page.tsx`, `finance/expenses/page.tsx`, `finance/payroll/page.tsx`, `finance/payroll/[id]/page.tsx`, `finance/reports/page.tsx`; components under `src/components/finance/` (`CollectPanel.tsx`, `PaymentForm.tsx`, `ClaimQueue.tsx`, `FeeStructureGrid.tsx`, `ExpenseForm.tsx`, `PayrollRunView.tsx`, `MoneyInput.tsx`); `src/app/staff/(app)/payslips/page.tsx` (my payslips)
- Modify: `src/app/staff/(app)/layout.tsx` nav group **Finance** (by permission), School Admin dashboard: Finance card (collected today, outstanding, claims) when `finance.read`; Accountant dashboard = finance overview (`src/app/staff/(app)/page.tsx` → `AccountantDashboard`); student profile Fees tab; Settings: finance fields; `LeaveTypesEditor` paid toggle.
- Test: `tests/e2e/finance.spec.ts`

- [ ] Build pages following existing patterns (`PageHeader`, `Card`, `Table`, `TabLinks`, `EmptyState` with next-step actions, `Modal` forms with `useAction`). Money inputs in rupees with 2 decimals → `toPaisa`. Every list has an empty state that says what to do first (no fee heads → "Set up fees", no invoices → "Generate November").
- [ ] E2E: accountant signs in → Collect → search `Ahmad Raza` → pay outstanding by cash → receipt dialog shows `R-…` → download PDF 200; Invoices → Generate month → defaulters tab lists students; Expenses → add → voucher; Payroll → new run → finalise → pay; Reports → CSV download; teacher: `/staff/finance` redirects to `/staff`; principal sees Reports only.
- [ ] Screenshots per page at 1360px and iPhone width, no horizontal overflow (reuse crawl script pattern). Commit `feat(finance): staff finance pages`.

### Task 11: Web UI — student Fees page

**Files:**

- Create: `src/app/student/(app)/fees/page.tsx`, `src/components/finance/ClaimForm.tsx` (amount, method, reference, date, photo via existing `PhotoEditor`-style capture but no crop, ≤300 KB)
- Modify: student layout nav (+ Fees), student dashboard tile "Fees due" with amount and due date, `tests/e2e/finance.spec.ts`

- [ ] E2E: student opens Fees → sees outstanding and invoice → "I have paid" → uploads png → claim `Waiting for school`; accountant confirms → student reloads → receipt link → PDF 200. Commit `feat(finance): student fees page and payment proof`.

### Task 12: Docs, final verification, PR

- [ ] README: Accountant demo login, finance env (none new), status row "7 — Finance". `docs/PLAN.md` delivery status.
- [ ] Run: `npx prettier --check . && npm run lint && npm run typecheck && npm test && npm run test:integration && npm run build && npx playwright test` → all green; paste counts into the PR description.
- [ ] Push branch `finance` (based on `phase-5-hardening` head if PR #18 is still open, else `main`), open PR with the template, body ends with the required attribution lines.
