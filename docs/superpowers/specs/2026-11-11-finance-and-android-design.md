# Finance module + Android app — design

**Status:** approved in conversation (2026-11-11). Two sub-projects, built in this order:

1. **Finance module** — backend (Prisma, RLS, services, routes, jobs) and web UI on the existing Next.js app.
2. **Android app** — Expo / React Native, one app for every role, offline-first, consuming the existing API
   including finance.

## 1. Intent

- Schools in Pakistan run fee collection, expenses and salaries on paper or Excel. EDUsaas gets a full finance
  module so the school office, the principal and parents see the same numbers.
- Everyone who uses EDUsaas also gets a native Android app: parents/students, teachers, school office, platform
  team. Same logins, same rules, works offline, feels native.
- Success: an accountant can run a month (generate invoices → collect at counter → confirm transfer proofs →
  record expenses → run payroll → read reports) from the web or the phone; a parent sees the bill, pays by
  transfer and uploads proof from the app; nothing is lost offline; every rupee is traceable and auditable.

### Decisions (from the planning conversation)

| Decision      | Choice                                                                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| App users     | All roles: student/parent, teacher, School Admin/Principal/Accountant, Platform Owner/Admin                                                         |
| Payments      | Counter (cash / bank slip / cheque) recorded by the school, plus parent-uploaded transfer proof (bank, JazzCash, Easypaisa). **No online gateway.** |
| Finance scope | Fee setup + billing + receipts; expenses + petty cash; staff salaries; reports + ledgers                                                            |
| Parent login  | Parent uses the student's login. No PARENT role.                                                                                                    |
| Money role    | New **ACCOUNTANT** staff role. School Admin can do everything an accountant can.                                                                    |
| Distribution  | Direct APK download from the web app (no Play Store for now).                                                                                       |
| App stack     | **Expo / React Native, Hermes, new architecture.** Not Kotlin, not Rust, not a WebView.                                                             |

## 2. Finance module

### 2.1 Role and permissions

New `UserRole.ACCOUNTANT`, signs in on the staff portal, email login (like Principal).

New permissions:

| Permission        | Who (default)                                                  | What                                                                      |
| ----------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `fees.manage`     | School Admin, Accountant                                       | Fee heads, fee structures, discounts, late-fee rule                       |
| `fees.collect`    | School Admin, Accountant                                       | Generate invoices, take payments, confirm/reject claims, reverse payments |
| `expenses.manage` | School Admin, Accountant                                       | Categories, record expenses                                               |
| `payroll.manage`  | School Admin, Accountant                                       | Salary structures, run payroll, mark paid                                 |
| `finance.read`    | School Admin, Accountant, Principal (configurable, default on) | All finance reports and ledgers                                           |
| `self.fees`       | Student                                                        | Own invoices, receipts, submit payment claims                             |

Accountant fixed permissions: the five finance ones plus `students.search`, `students.read` (to find a student at
the counter). Nothing else: no attendance, marks, settings or user management. Principal gets `finance.read` as a
configurable toggle. Teachers and Admissions get nothing.

Platform roles never get finance data (same rule as every tenant table). Plan limits count Accountants as staff.

### 2.2 Data model

All tables carry `tenant_id` with the standard RLS policy, `enforce_same_tenant` triggers on every cross-table
reference, and the usual grants. **Money is `BIGINT` paisa** (1 PKR = 100 paisa); never Decimal or float.

| Table                   | Columns (beyond id, tenant_id, timestamps)                                                                                                                                                                                                                                                                                              | Notes                                                                                           |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `fee_heads`             | name, kind (`MONTHLY` \| `TERM` \| `ONCE`), archived_at                                                                                                                                                                                                                                                                                 | Tuition, Transport, Exam, Admission… unique (tenant, name)                                      |
| `fee_structures`        | academic_year_id, class_id, fee_head_id, amount_paisa                                                                                                                                                                                                                                                                                   | unique (year, class, head)                                                                      |
| `student_fee_overrides` | student_id, fee_head_id, amount_paisa, note                                                                                                                                                                                                                                                                                             | per-student replacement amount (e.g. different transport route)                                 |
| `fee_discounts`         | student_id, fee_head_id (null = all), kind (`PERCENT` \| `FIXED`), value, reason, valid_from, valid_to                                                                                                                                                                                                                                  | sibling, scholarship, staff child…                                                              |
| `late_fee_rules`        | academic_year_id, grace_days, kind (`FIXED` \| `PERCENT` \| `PER_DAY`), value, cap_paisa                                                                                                                                                                                                                                                | one per year                                                                                    |
| `invoices`              | student_id, academic_year_id, period (`YYYY-MM` for monthly, `YYYY-T1` for term, `YYYY-ONCE-<headId>`), number (per-school sequence), issued_on, due_on, subtotal_paisa, discount_paisa, late_fee_paisa (frozen on full payment), paid_paisa, status (`DUE` \| `PARTIAL` \| `PAID` \| `WAIVED` \| `VOID`), generated_by (`JOB` \| user) | unique (student, period). `VOID` only before any payment.                                       |
| `invoice_lines`         | invoice_id, fee_head_id, description, amount_paisa, discount_paisa                                                                                                                                                                                                                                                                      |                                                                                                 |
| `payments`              | invoice_id (null = advance / on account), student_id, amount_paisa, method (`CASH` \| `BANK` \| `JAZZCASH` \| `EASYPAISA` \| `CHEQUE`), reference, received_on, received_by, receipt_number (per-school gap-free sequence), proof_key, note, reversed_by_payment_id                                                                     | **never deleted**; reversal = new payment with negative amount linked both ways                 |
| `payment_claims`        | student_id, invoice_id, amount_paisa, method, reference, paid_on, proof_key, status (`PENDING` \| `CONFIRMED` \| `REJECTED`), decided_by, decided_at, decision_note, payment_id                                                                                                                                                         | parent-uploaded proof; confirm creates a `payments` row                                         |
| `expense_categories`    | name, archived_at                                                                                                                                                                                                                                                                                                                       | Utilities, Repairs, Stationery, Salaries (system)…                                              |
| `expenses`              | category_id, amount_paisa, spent_on, paid_to, method, voucher_number (sequence), reference, receipt_key, note, entered_by, reversed_by_expense_id                                                                                                                                                                                       | same no-delete rule                                                                             |
| `salary_structures`     | user_id, basic_paisa, allowances JSON `[{name, amount}]`, deductions JSON, effective_from, per_day_deduction (`BASIC_30` \| `NONE`)                                                                                                                                                                                                     | one active per staff user                                                                       |
| `payroll_runs`          | period `YYYY-MM`, status (`DRAFT` \| `FINALISED` \| `PAID`), total_paisa, run_by, finalised_at                                                                                                                                                                                                                                          | one per month                                                                                   |
| `payslips`              | payroll_run_id, user_id, basic, allowances, deductions, unpaid_leave_days, leave_deduction_paisa, net_paisa, paid_on, method, reference, number                                                                                                                                                                                         | unpaid-leave days come from `leave_requests` with an unpaid leave type; snapshotted at run time |
| `ledger_entries`        | entry_on, kind (`FEE` \| `ADVANCE` \| `EXPENSE` \| `SALARY` \| `REVERSAL`), direction (`IN` \| `OUT`), amount_paisa, method, ref_table, ref_id, student_id?, user_id?, created_by                                                                                                                                                       | **insert-only** (trigger blocks update/delete). Reports read only this table.                   |
| `finance_sequences`     | kind (`RECEIPT` \| `INVOICE` \| `VOUCHER` \| `PAYSLIP`), next                                                                                                                                                                                                                                                                           | row-locked (`SELECT … FOR UPDATE`) inside the writing transaction → gap-free numbers            |

`LeaveType` gains `paid Boolean @default(true)`; unpaid types reduce salary.
`SchoolSettings` gains `invoiceDay Int @default(1)`, `feeDueDays Int @default(10)`, `currency` fixed `PKR`,
`receiptFooter String?`.

### 2.3 Rules

- Invoice generation (job, 1st of month at school time, or on demand per class/student): for each active placed
  student, lines = fee structure for their class (+ overrides) for every MONTHLY head; TERM heads in the first
  month of each term (settings: term start months, default Apr/Sep/Jan); ONCE heads only if never invoiced for
  that student. Discounts applied per line. Idempotent: `unique (student, period)`.
- Late fee computed at read time from the rule once `today > due_on + grace`; **frozen** into `late_fee_paisa`
  the moment the invoice becomes `PAID`. Accountant may waive late fee (audited).
- Payment allocation: a payment names one invoice, or is an advance. Advances auto-apply to the next generated
  invoice (`ADVANCE` ledger entry then a `FEE` entry when applied).
- Status: `paid >= subtotal - discount + late_fee` → `PAID`; `0 < paid` → `PARTIAL`; else `DUE`.
- Reversal: creates a mirror payment (negative amount, `reversed_by` links both ways), ledger `REVERSAL` entry,
  invoice status recomputed, late-fee freeze lifted if it goes back to unpaid. Needs `fees.collect` and a reason.
- Withdrawn/graduated students: no new invoices; existing balance stays visible; ledger untouched.
- Payment claims: student submits amount + method + reference + proof photo (≤300 KB, sniffed jpg/png/webp,
  stored under `finance/{prefix}/claims/{id}.{ext}`). Accountant confirms (→ payment, receipt) or rejects with a
  note; student notified either way. A claim cannot exceed the outstanding balance + 0 (advances via claim not
  allowed; keep it simple).
- Receipts: `R-000123` per school, PDF via pdf-lib (school name, student, invoice period, lines, amount in words,
  method, reference, received by, footer). Payslips `P-…`, vouchers `V-…`, invoices `I-…`.
- Payroll: run for a month → draft payslips from active salary structures; unpaid leave days = approved leave
  on unpaid types overlapping the month (working days only, school timezone); finalise (locks amounts); mark
  paid per slip or all (writes `SALARY` ledger entries + a system `Salaries` expense category total). Draft can be
  deleted; finalised cannot.
- Reports (all from `ledger_entries` + invoices):
  - Daily collection: by day and method, with receipt list.
  - Defaulters: students with `DUE`/`PARTIAL` invoices past due, by class, with balance and guardian phone.
  - Income vs expense: month-by-month for the year.
  - Student ledger: every invoice, payment, discount, reversal for one student, running balance.
  - Month summary: invoiced, collected, outstanding, expenses, salaries, net.
  - CSV (formula-neutralised like existing exports) and PDF for month summary and student ledger.
- Notifications (existing bell + push): invoice issued, due in 3 days, overdue, payment received (with receipt
  link), claim confirmed/rejected, payslip ready.
- Audit actions: `fee_head.*`, `fee_structure.*`, `discount.*`, `invoice.generate|void|waive_late`,
  `payment.record|reverse`, `claim.submit|confirm|reject`, `expense.record|reverse`, `payroll.run|finalise|pay`.
  Audit labels added to `src/lib/audit-labels.ts`; audit viewer gets a "Finance" category.
- Plan limits: unchanged (students/staff). Finance counts nothing extra.

### 2.4 API (v1, `defineRoute`, same pipeline)

```
GET/POST        /fees/heads            PATCH /fees/heads/[id]
GET/PUT         /fees/structures?yearId   (bulk upsert: [{classId, feeHeadId, amountPaisa}])
GET/PUT         /fees/late-fee?yearId
GET/POST        /students/[id]/fees/overrides   DELETE /students/[id]/fees/overrides/[id]
GET/POST        /students/[id]/fees/discounts   PATCH  /students/[id]/fees/discounts/[id]  (end it)
POST            /invoices/generate     {period, classId?, studentId?}
GET             /invoices?status&classId&period&q     GET /invoices/[id]     POST /invoices/[id]/void
POST            /invoices/[id]/waive-late-fee
GET             /students/[id]/fees    (ledger + outstanding; also /me/fees for students)
POST            /payments              {invoiceId?|studentId, amountPaisa, method, reference?, receivedOn, note?, clientKey}
GET             /payments/[id]/receipt.pdf
POST            /payments/[id]/reverse {reason}
GET/POST        /me/fees/claims        (student)    GET /fees/claims?status   POST /fees/claims/[id]/decide
GET/POST        /expenses/categories   PATCH /expenses/categories/[id]
GET/POST        /expenses              POST /expenses/[id]/reverse   GET /expenses/[id]/voucher.pdf
GET/PUT         /payroll/structures/[userId]
GET/POST        /payroll/runs          GET /payroll/runs/[id]   POST /payroll/runs/[id]/finalise
POST            /payroll/runs/[id]/pay {payslipIds?, paidOn, method}     DELETE /payroll/runs/[id] (draft)
GET             /payslips/[id].pdf     GET /me/payslips (staff)
GET             /finance/reports/daily|defaulters|income-expense|summary|student-ledger  (?format=json|csv|pdf)
GET             /finance/overview      (dashboard numbers)
```

Every write accepts `clientKey` (UUID) for idempotency from the offline queue; the server dedupes on
`(tenant_id, client_key)` for payments, expenses and claims.

### 2.5 Web UI

Staff portal gets a **Finance** nav group (shown by permission):

- **Finance dashboard** (Accountant home; also a card on School Admin's dashboard): collected today, outstanding,
  defaulters count, claims waiting, this month invoiced vs collected, expenses this month.
- **Collect**: search student → outstanding invoices → take payment (amount, method, reference) → receipt
  (print / PDF). Advance payment option.
- **Invoices**: filter by month/class/status; Generate month; defaulters list with phone; per-invoice page.
- **Claims**: queue of parent proofs with photo preview; confirm / reject.
- **Fee setup**: heads, per-class amounts grid for the year, late-fee rule, term months. Copy from last year.
- **Expenses**: list + add; categories; voucher PDF.
- **Payroll**: salary structures per staff; monthly run → review → finalise → pay; payslip PDF.
- **Reports**: tabs as in 2.3, CSV/PDF.
- Student page gets a **Fees** tab (ledger, discounts, overrides).

Student portal: **Fees** page — outstanding, invoices, receipts (PDF), "I have paid" → claim form with photo;
status of claims. Dashboard tile "Fees due".

Staff (teachers etc.): **My payslips** under Password/profile area when a payslip exists.

Settings: invoice day, due days, receipt footer, term start months. Principal toggle `finance.read`.

### 2.6 Jobs

Added to the daily cron, each idempotent: `invoicesGenerate` (on `invoiceDay` per school), `feeReminders`
(3 days before due, on overdue; one notification per invoice per stage), `advancesApply`. Step keys appended to
the cron test list.

### 2.7 Seed

Bright Star: fee heads, structure for every class, 2 discounts, invoices for the year so far with ~85% paid,
a few pending claims, 30 expenses, salary structures for all staff, 2 finalised payroll runs. Accountant
`accounts@bss.test`. Green Valley: minimal.

### 2.8 Tests

- Unit: money math (paisa, discount rounding half-up, late fee kinds, amount in words), period helpers.
- Integration: RLS on every new table (cross-tenant read/write blocked); `check-rls` script passes; sequences are
  gap-free under 20 concurrent payments; invoice generation idempotent; status transitions; reversal restores
  state; claim confirm creates payment + receipt; payroll unpaid-leave deduction; ledger insert-only trigger;
  reports add up to ledger totals; every new route in the authz MATRIX (Accountant allowed, Teacher/Student/
  Platform denied, Student only `/me/*`).
- E2E (Playwright): accountant collects a fee and prints receipt; parent uploads proof → accountant confirms →
  parent sees receipt; payroll month; principal reads reports; teacher cannot open Finance.

## 3. Android app

### 3.1 Repo layout

```
apps/mobile/            Expo app (TypeScript, expo-router)
packages/shared/        zod schemas, API types, permissions, money + date helpers, audit labels
```

npm workspaces at the repo root. The Next.js app moves nothing; it imports `@edusaas/shared` where it currently
duplicates (schemas used by both sides, `audit-labels`, money helpers). Web build and tests unchanged.

### 3.2 Stack

Expo SDK 52+, React Native new architecture, Hermes. expo-router (file routes, typed), TanStack Query with
persister → expo-sqlite, Drizzle for the local cache tables, Zustand for session/UI state, expo-secure-store
(Keystore) for the session token, expo-local-authentication (biometric unlock), expo-notifications (push),
expo-camera + expo-image-manipulator (proof photos ≤300 KB), expo-print / expo-sharing (receipts, payslips,
report cards), @shopify/flash-list, react-native-reanimated, NativeWind for styling with the same pastel tokens
as the web. Sentry RN SDK only when `SENTRY_DSN` set.

### 3.3 Auth

Portal picker → login form → `POST /api/v1/auth/{portal}/login`. The server returns the session token in a
`Set-Cookie`; the app reads it and stores it in SecureStore, sends it as `Cookie` (+ `Origin: app://edusaas`,
which the origin check must whitelist; a new `X-EDUsaas-Client: android/<version>` header). Forced password
change screen. Logout calls the API and wipes cache + queue. Session refresh on 401 → back to login.
Server adds `GET /api/v1/mobile/config` (min app version, APK URL, feature flags) and `POST /me/push-token`.

### 3.4 Navigation by role

| Role                     | Tabs                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| STUDENT (parent)         | Home · Attendance · Marks · Fees · More (timetable, leave, announcements, report card, past report cards, password) |
| TEACHER                  | Today · Attendance · Marks · Leave · More (timetable, announcements, my students, payslips)                         |
| SCHOOL_ADMIN / PRINCIPAL | Dashboard · Attendance · Finance · People · More (leave, marks, announcements, reports, support)                    |
| ACCOUNTANT               | Collect · Invoices · Claims · Expenses · More (payroll, reports, fee setup)                                         |
| ADMISSIONS_OFFICER       | Students · Admit · Announcements · More                                                                             |
| PLATFORM_OWNER / ADMIN   | Schools · Support · Plans · More (admins, audit) — by permission                                                    |

Screens mirror the web pages one-to-one in capability; forms use the same zod schemas from `@edusaas/shared`.

### 3.5 Offline

- **Read cache**: every query persisted in SQLite; screens render cached data instantly, refetch on focus and on
  reconnect; "last updated" shown when stale > 1 h; explicit pull-to-refresh.
- **Write queue** (`queue` table): attendance batches, marks, check-in, leave requests/decisions, payments,
  expenses, payment claims (with photo file path), announcements. Each item carries the same `clientKey`
  idempotency UUID the web queue uses. Flushed in order on reconnect / app foreground / background fetch; server
  responses update the cache; 4xx errors surface as a "needs attention" list (never dropped silently); 5xx and
  network retry with backoff.
- **Conflicts**: server is the source of truth; a rejected attendance batch for a closed day is shown with the
  reason and can be discarded.

### 3.6 Native features

Push notifications (token registered per device, server fan-out through the existing notification writer);
camera/gallery for proofs; share/print PDFs; biometric unlock; haptics on register toggles; `FLAG_SECURE` on
receipt and payslip screens; deep links `edusaas://…` for notification taps.

### 3.7 Performance budget

Cold start < 1.5 s on a 2019 mid-range phone; list screens 60 fps with 500 rows (FlashList, memoised rows);
APK < 30 MB (Hermes, ProGuard/R8, no dev modules, WebP assets); no network call before first paint.

### 3.8 Build and distribution

`apps/mobile/eas.json` with `preview` (APK) and `production` (AAB for later). `npm run android:apk` runs a local
Gradle release build when EAS is not available. Version = `package.json` version, build number = CI run.
GitHub Actions workflow `mobile.yml`: lint, typecheck, Jest, then a release APK artifact on tags `mobile-v*`.
The web app serves `/download` with the latest APK link + version + changelog (reads `mobile/releases.json`).

### 3.9 Tests

- Jest: shared package; queue reducer; money/date helpers; permission → tabs mapping.
- React Native Testing Library: login (3 portals, forced change), each tab root renders from cache, register
  toggles, collect-fee form validation, claim form.
- Maestro flows (CI on an emulator; also runnable locally): sign in per role; teacher takes register offline →
  reconnect → synced once; accountant collects a fee → receipt shared; parent submits claim → accountant confirms
  → parent sees receipt; payroll mark paid; platform owner sees schools.

## 4. Delivery order

1. Finance backend (schema → migration + RLS → services → routes → jobs → seed → tests).
2. Finance web UI + e2e.
3. Shared package extraction (web keeps passing).
4. Mobile app: scaffold + auth + offline core → student/parent → teacher → admin/principal → accountant →
   platform → push, PDFs, polish → APK pipeline + download page.
5. Mobile tests, full verification, docs, PR.

## 5. Out of scope (now)

Online payment gateway; PARENT role with multi-child linking; iOS build (code will run, not shipped); Play Store
listing; bank reconciliation imports; GST/tax; multi-currency.
