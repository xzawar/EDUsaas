# EDUsaas — Master Implementation Plan

> **Status:** Approved. Phase 0 and Phase 1 in progress.
> **Source of truth:** [`docs/spec/Education_SaaS_Final_Specification.pdf`](spec/Education_SaaS_Final_Specification.pdf) (the "TRUE FINAL" spec).
> **Reference code:** [`prototype/`](../prototype) (the uploaded working web prototype, kept as-is for reference).
>
> Where this plan says something the spec does not, it is either filling a gap or recorded as a **confirmed decision** (§3).

---

## Contents

1. [What we are building](#1-what-we-are-building)
2. [Prototype assessment (gap analysis)](#2-prototype-assessment-gap-analysis)
3. [Confirmed decisions](#3-confirmed-decisions)
4. [Target architecture](#4-target-architecture)
5. [Repository layout](#5-repository-layout)
6. [Data model](#6-data-model)
7. [Security design](#7-security-design)
8. [Module designs](#8-module-designs)
9. [API surface (v1)](#9-api-surface-v1)
10. [Testing strategy](#10-testing-strategy)
11. [Delivery phases & milestones](#11-delivery-phases--milestones)
12. [Environments, CI/CD & hosting](#12-environments-cicd--hosting)
13. [Risks & mitigations](#13-risks--mitigations)
14. [Out of scope (v1)](#14-out-of-scope-v1)

---

## 1. What we are building

A **multi-tenant School Management System** sold as SaaS. One school = one tenant. Universities are out of scope.

**Hierarchy:** Tenant → Academic Year → Class → Section.

**Seven roles:**

| Layer    | Role               | Access model                                                                                                     |
| -------- | ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Platform | Platform Owner     | Manages tenants, plans, platform admins. **No silent tenant-data access**; uses break-glass grants.              |
| Platform | Platform Admin     | Operational only. Zero tenant data by default.                                                                   |
| School   | School Admin       | One per school. Full control of the school, creates all other accounts, configures Principal/Admissions toggles. |
| School   | Principal          | Oversight. **Permissions configurable per school** by the School Admin. Student search always on (read-only).    |
| School   | Admissions Officer | Student intake: add, bulk import, assign section, generate username, activation/reset.                           |
| School   | Teacher            | Fixed scope: only assigned sections/subjects. **Class Incharge** is a designation on a section, not a role.      |
| School   | Student            | Own records only. Parents use the student's account (no parent login).                                           |

**v1 modules:** Auth & identity · Students & teachers · Classes & sections · Attendance (student + teacher) · Leave · Tests/marks/grades/remarks · Timetable · Reports & dashboard alerts · Bulk Excel import · Audit logs · In-app notifications · Report card generation.

**Client:** browser web app (Next.js). The teacher attendance/marks flow is an **installable, offline-capable PWA**.

---

## 2. Prototype assessment (gap analysis)

The prototype (~100 KB of TypeScript, mostly compressed into ~360 very long lines) shows the right screens and flows and is useful as a **UX and flow reference**. It is **not a safe base to keep building on**. Main findings, checked against the spec:

### 2.1 Critical (security / data integrity)

| #   | Finding                                                                                                                                                                                                                 | Spec ref      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| C1  | **No Row-Level Security.** Tenant isolation is application-only. Spec says RLS is mandatory on every tenant table.                                                                                                      | §8, §9.2      |
| C2  | **Platform Owner has every tenant permission** in `lib/permissions.ts`. Spec requires zero silent access, only time-boxed audited break-glass grants.                                                                   | §2.7, §9.6    |
| C3  | **Service worker caches every GET response**, including authenticated pages/API data, in one shared cache. On a shared school computer the next user can see the previous user's data offline.                          | §6.2, §12.2   |
| C4  | **Attendance unique key includes a nullable `subjectId`.** In Postgres `NULL`s are distinct, so once-daily attendance (no subject) can be inserted twice for the same student and day. No `clientUuid` idempotency key. | §6.3          |
| C5  | **Teacher marks check is by subject only, not section.** A teacher assigned "Math, 8-A" can enter Math marks for 8-B students. Student IDs in batches are not verified against the section.                             | §2.4, §9.2    |
| C6  | **Cron secret is optional.** If `CRON_SECRET` is unset, the cron endpoint is public.                                                                                                                                    | §11.3         |
| C7  | **Bulk import sets everyone's password to `Student123!`** with no forced change, and no idempotency key.                                                                                                                | §9.3, §9.5    |
| C8  | Sessions are **not revoked** on password change, role change or deactivation. bcrypt is used instead of Argon2id.                                                                                                       | §3.4, §9.3    |
| C9  | No CSP/HSTS. `audit_logs` is not insert-only at DB level.                                                                                                                                                               | §9.7, Phase 5 |

### 2.2 Functional gaps

- No correction windows (3-day rolling attendance, 7-day per-assessment marks); edits are silent upserts.
- Marks have no draft → submitted → published lifecycle; assessments aren't tied to a section or academic year.
- No grading schemes (versioned per year), no remark moderation.
- Promotion doesn't generate or archive report-card PDFs and doesn't delete the closed year's raw data. Usernames get collision suffixes (`...-14` → `...-141`) instead of relying on roll-number uniqueness.
- No roll-number renumbering, no section transfer action, no 30-day soft-delete restore.
- Leave: no leave types, no routing (Class Incharge → fallback), no age-out.
- Timetable conflict check is check-then-insert (race-prone); no DB constraint.
- Search: no pg_trgm fuzzy search, no pagination, no role scoping.
- Offline: no IndexedDB queue, no background sync, no `synced_late` handling.
- No break-glass support grants, plans/subscriptions, import jobs/errors, archival jobs.
- **Schema bug:** the photo route writes `student.photoUrl`, a field that doesn't exist on `Student`, so student photo upload throws at runtime.
- No migrations committed, no tests, `/api/v1` is just a rewrite alias.

### 2.3 Recommendation

**Rebuild cleanly on the same stack** (Next.js + Prisma + Postgres + zod), with the prototype as the UI/flow reference. Port salvageable pieces where they fit: username normalization, photo crop editor, timetable overlap logic, page layouts. Fixing C1–C9 in place would touch every route, so a structured rebuild costs about the same and gives us tests and a consistent request pipeline from day one.

---

## 3. Confirmed decisions

Confirmed by the product owner on 2026-11-04.

| #   | Decision                       | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Separate login portals.**    | Three separate sign-in pages, each accepting only its own roles: **Student portal** `/login` (username), **Staff portal** `/staff/login` (Teachers by username; School Admin, Principal and Admissions Officer by email), **Platform console** `/platform/login` (email). A valid account used on the wrong portal gets the same generic "invalid credentials" error (no role disclosure). Each portal has its own app area (`/student`, `/staff`, `/platform`); the session row records its portal and an area never accepts another portal's session. All portals share one hardened credential/session engine (Argon2id, lockout, revocation) behind an `AuthProvider` interface, so the staff portal can be switched to Supabase Auth later without touching other modules. |
| D2  | Teacher usernames              | `{prefix}-t-{name}-{n}`, e.g. `bss-t-alikhan-3`. Stable; never changes at promotion.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D3  | Per-period attendance key      | `(tenant, section, date, period)`; once-daily = period 1. Subject stored, not part of the key.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D4  | Long-running jobs              | Postgres `jobs` table + chunked worker behind a host-agnostic HTTP trigger (QStash or any scheduler); progress-page fallback.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D5  | Leave routing                  | Student → Class Incharge → School Admin after 48h. Teacher → Principal (if toggled) → School Admin. No self-approval.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| D6  | Timezone                       | `tenant_settings.timezone`, default `Asia/Karachi`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D7  | Withdrawal retention           | Anonymize name/guardian/photo 1 year after withdrawal.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D8  | **Hosting**                    | **Vercel is for demo and development only.** Production hosting will be chosen later, so the app must stay host-portable: Next.js `standalone` output + `Dockerfile`, no Vercel-only APIs in app code, scheduled work exposed as secret-protected HTTP endpoints that any scheduler (Vercel Cron in demo, system cron/QStash/Cloud Scheduler in production) can call.                                                                                                                                                                                                                                                                                                                                                                                                           |
| D9  | Raw-data deletion at promotion | Delete only after PDF upload is verified and a 14-day grace period has passed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## 4. Target architecture

```
Browser (Next.js app + PWA service worker + IndexedDB queue)
   │  HTTPS, HTTP-only session cookie
   ▼
Vercel ─ Next.js App Router
   ├─ Server Components (pages)  ─┐
   └─ Route Handlers /api/v1/*   ─┴─► Request pipeline (§7.1)
                                        │
                                        ├─► Prisma ──► Supabase Postgres (RLS on every tenant table)
                                        ├─► StorageService ──► Local disk (dev) | Cloudflare R2 (prod)
                                        ├─► Job queue (Postgres table) ◄── QStash / Vercel Cron
                                        └─► Sentry
```

**Stack (locked by spec, versions pinned in Phase 0):**

| Concern       | Choice                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Framework     | Next.js 15 (App Router, route handlers), React 19, TypeScript strict                                                      |
| DB / ORM      | Supabase PostgreSQL + Prisma (migrations committed; raw SQL migrations for RLS/grants/pg_trgm)                            |
| Validation    | zod at every API boundary                                                                                                 |
| Passwords     | Argon2id (`@node-rs/argon2`)                                                                                              |
| UI            | Tailwind CSS + shadcn/ui components; TanStack Table for grids                                                             |
| PWA / offline | Serwist (maintained successor of next-pwa) + Dexie (IndexedDB)                                                            |
| Excel         | SheetJS (`xlsx` from the official CDN build; npm 0.18.5 has known CVEs), parsed in an isolated worker with size/cell caps |
| PDF           | `@react-pdf/renderer` (pure JS, serverless-friendly)                                                                      |
| Storage       | `StorageService` interface → `LocalStorage` / `R2Storage` (S3 SDK)                                                        |
| Jobs          | Postgres `jobs` table + QStash (D4); Vercel Cron for daily/monthly schedules                                              |
| Monitoring    | Sentry                                                                                                                    |
| Tests         | Vitest (unit + integration against real Postgres), Playwright (e2e incl. offline)                                         |

---

## 5. Repository layout

```
edusaas/
├─ docs/
│  ├─ PLAN.md                     ← this file
│  ├─ spec/                       ← final specification (PDF)
│  └─ adr/                        ← short decision records (D1–D9 once answered)
├─ prototype/                     ← original prototype, reference only, not built
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/                 ← Prisma + hand-written SQL (RLS, grants, pg_trgm)
│  └─ seed.ts                     ← two demo schools (to test cross-tenant isolation)
├─ src/
│  ├─ app/
│  │  ├─ (auth)/login, change-password, reset-password
│  │  ├─ (app)/dashboard/...      ← role-aware pages
│  │  ├─ (platform)/platform/...  ← platform owner/admin console
│  │  └─ api/v1/...               ← route handlers (thin)
│  ├─ server/
│  │  ├─ http/                    ← defineRoute() pipeline, errors, pagination
│  │  ├─ auth/                    ← passwords, sessions, login, lockout, reset
│  │  ├─ authz/                   ← permission catalog, can(), teacher/section scopes
│  │  ├─ db/                      ← prisma client, withTenant() RLS transaction
│  │  ├─ modules/                 ← one folder per domain: service + schemas
│  │  │   students/ teachers/ structure/ attendance/ leave/ assessment/
│  │  │   timetable/ reports/ imports/ promotion/ platform/ notifications/ audit/ search/
│  │  ├─ jobs/                    ← job runner + handlers (promotion, import, archival)
│  │  ├─ storage/                 ← StorageService, local, r2
│  │  └─ pdf/                     ← report card template
│  ├─ client/
│  │  ├─ offline/                 ← Dexie DB, queue, sync
│  │  └─ api.ts                   ← typed fetch wrapper
│  ├─ components/                 ← UI components
│  └─ sw.ts                       ← Serwist service worker
├─ tests/
│  ├─ unit/  integration/  authz/  e2e/
├─ .github/workflows/             ← ci.yml, codeql.yml; dependabot.yml
└─ .devcontainer/                 ← Codespaces / local switchable (spec §11.7)
```

---

## 6. Data model

All tenant tables have `id uuid`, `tenant_id uuid NOT NULL`, `created_at`, `updated_at`, and (where restorable) `deleted_at`. Every tenant table gets an RLS policy. Grouped as in spec §8:

**Tenancy**

- `tenants` — name, `prefix` (unique platform-wide, `^[a-z0-9]{2,10}$`), status (trial/active/suspended), plan_id.
- `tenant_settings` — timezone, attendance_mode (`once_daily` | `per_period`, default once_daily), at_risk_threshold (75), marks_publisher (`school_admin` | `principal`), leave_age_out_hours (48).
- `tenant_role_permissions` — (tenant, role, permission, granted). The per-school toggles for Principal and Admissions Officer.

**Identity**

- `users` — tenant_id (null for platform), role, username, `username_normalized` (unique), email (unique, nullable), password_hash, must_change_password, status, failed_login_attempts, locked_until, last_login_at, deleted_at.
- `permissions` — catalog seeded from code (`students.write`, `attendance.edit_any`, …). `role_permissions` — fixed defaults per role.
- `sessions` — token_hash, user_id, expires_at, last_seen_at, ip_hash, user_agent.
- `password_reset_tokens` — token_hash, user_id, expires_at (30 min), used_at.

**People**

- `students` — user_id, section_id (current placement), roll_number, admission_no, guardian_name, guardian_phone, photo_key, status, withdrawn_at, anonymized_at. **Unique (section_id, roll_number)**.
- `teachers` — user_id, employee_no, photo_key.

**Structure**

- `academic_years` — name, starts_on, ends_on, status (planned/current/closed). One `current` per tenant (partial unique index).
- `classes` — academic_year_id, name, grade_level. `sections` — class_id, name, capacity, `class_teacher_id` (Class Incharge), `next_roll_number`.
- `subjects` — name, code. `class_subjects`.
- `teacher_assignments` — teacher_id, section_id, subject_id. **Unique (teacher, section, subject).** The source of every teacher scope check.

**Attendance & leave**

- `attendance_batches` — section_id, date, period (D3), subject_id, submitted_by, `client_uuid` (unique), client_recorded_at, server_received_at, synced_late. **Unique (tenant, section, date, period).**
- `attendance_records` — batch_id, student_id, status (present/absent/late/leave/excused). Unique (batch_id, student_id).
- `teacher_attendance` — teacher_id, date, status, `checked_in_at`, client_uuid, corrected_by. Unique (teacher, date). Kept fully separate from student attendance.
- `leave_types`, `leave_requests` (applicant, type, from/to, reason, status, current_approver_role), `leave_approvals` (decision trail).

**Assessment**

- `grading_schemes` — academic_year_id, version, bands jsonb (`[{min, max, grade, remark}]`). Immutable once used.
- `assessments` — section_id, subject_id, academic_year_id, grading_scheme_id, name, max_marks, held_on, status (draft/submitted/published), submitted_by, submitted_at, published_at.
- `marks` — assessment_id, student_id, score (numeric, 0..max_marks, CHECK), absent flag. Unique (assessment, student).
- `remarks` — student_id, author_teacher_id, subject_id?, text, status (pending/approved/rejected), moderated_by.

**Scheduling & comms**

- `timetable_slots` — tenant-wide period grid: day_of_week, period_no, starts_at, ends_at.
- `timetable_entries` — section_id, slot_id, subject_id, teacher_id, room. **Unique (section, slot)** and **unique (teacher, slot)**: conflicts are impossible at DB level.
- `announcements` — title, body, audience (all/role/section), published_at. `notifications` — user_id, kind, title, body, link, read_at.

**Ops & security**

- `import_jobs` — idempotency_key (unique), file_key, status, counts, created_by. `import_errors` — row, field, message.
- `jobs` — type, payload, status, attempts, run_after, progress (generic queue, D4).
- `report_cards` — student_id, academic_year_id, storage_key, generated_at, verified_at. (Index of archived PDFs; holds no academic data.)
- `audit_logs` — actor_id, actor_role, tenant_id, action, entity, entity_id, before jsonb, after jsonb, ip_hash, request_id, support_grant_id. **Insert-only for the app role.**
- `support_grants` — requested_by, approved_by, tenant_id, reason, starts_at, expires_at, revoked_at.

**SaaS**

- `plans`, `subscriptions`, `usage_counters` (students, teachers, storage bytes per tenant).

**Key indexes:** `users(username_normalized)`, GIN trigram on `users.display_name` (pg_trgm), `students(tenant_id, section_id)`, `students(guardian_phone)`, `attendance_batches(tenant_id, section_id, date)`, `attendance_records(student_id)`, `marks(student_id)`, `audit_logs(tenant_id, created_at)`.

**Deliberately absent (spec §8.2):** university tables, username history, session_version, Redis, employees table, permanent per-year attendance/marks storage.

---

## 7. Security design

### 7.1 Request pipeline: one wrapper for every route

Every handler is declared through `defineRoute()`, so the spec §9.1 order cannot be skipped:

```ts
export const POST = defineRoute({
  permission: 'attendance.submit', // checked server-side, never from client
  input: SubmitAttendanceSchema, // zod; rejects unknown keys
  handler: async (ctx, input) => attendance.submitBatch(ctx, input),
});
```

`HTTPS → rate limit/lockout → session lookup → tenant resolution (from session, never body) → permission check → zod validation → business rules (scope, windows) → withTenant() DB transaction → audit → typed response`.

Errors use one shape: `{ error: { code, message, details? } }`, with consistent status codes (400/401/403/404/409/422/423/429).

### 7.2 RLS with Prisma

- Migrations run as the owner role. The app connects as **`app_user`**: not the table owner, no `BYPASSRLS`.
- `withTenant(ctx, fn)` opens a transaction and runs `SELECT set_config('app.tenant_id', $1, true)` (plus `app.user_id`, `app.role`), then runs all queries inside it. This is safe with Supabase's transaction-mode pooler because the setting is transaction-local.
- Policy on every tenant table: `USING (tenant_id = current_setting('app.tenant_id', true)::uuid)` with matching `WITH CHECK`. An unset setting matches nothing (fail closed).
- Platform routes use a separate `withPlatform()` context that can read `tenants`/`plans` only. Tenant data access for platform users requires an active `support_grant`, which sets `app.tenant_id` and stamps every audit row with the grant ID.
- **Audit logs:** `app_user` has `INSERT, SELECT` only. Archival deletes go through a `SECURITY DEFINER` function that can delete only rows older than the current month, and only after the archive upload is recorded.

### 7.3 Authentication

- Three portals (D1): student `/login`, staff `/staff/login`, platform `/platform/login`. Within a portal the server tries `username_normalized`, then email, then checks the account's role is allowed on that portal. The role is never chosen by the user; the portal can only narrow access, never grant it.
- Each portal has its own app area (`/student/*`, `/staff/*`, `/platform/*`). The session row stores its `portal`, and each area only accepts sessions from its own portal. Signing in to a different portal replaces the current session.
- Argon2id; `must_change_password` for every admin-issued or imported credential.
- Opaque 32-byte session token in an `HttpOnly; Secure; SameSite=Lax` cookie; SHA-256 hash in DB. Sliding expiry 60 days inactivity (configurable to 90).
- Revoke all sessions on password change, role change, deactivation and admin reset. Logout deletes the session row.
- Lockout: 5 failures → 15-minute lock (`failed_login_attempts`, `locked_until`). Same error for unknown user and bad password.
- Password reset: email accounts get single-use 30-minute tokens with a non-disclosing response. Students/Teachers get admin reset only (spec §3.5).
- CSRF: SameSite=Lax plus an `Origin` header check on all mutating routes.

### 7.4 Other controls

- Security headers: CSP (nonce-based), HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy.
- Uploads: magic-byte sniffing (`file-type`), size caps, pixel limits, re-encode with `sharp` to small WebP, generated R2 keys, **private bucket + short-lived signed URLs** (student photos are not public).
- Excel import: content-sniff, cap compressed (5 MB) and decompressed size, cap rows/cells before full parse, no formulas/external entities, neutralize `= + - @ \t \r` prefixes on import **and** export, idempotency key per job.
- Cron/QStash routes: required secret (constant-time compare); the app refuses to boot in production without it.
- Never log secrets, passwords, tokens or cookies (Sentry `beforeSend` scrubber).
- Offline cache: the service worker caches only the **static app shell**. Rosters live in IndexedDB keyed by user ID and are **wiped on logout and on user switch**.

---

## 8. Module designs

### 8.1 Usernames & roll numbers

- Student: `{prefix}-{class}{section}-{firstname}-{roll}` → `bss-9a-ahmad-14`. `normalize()` = lowercase, strip non-alphanumerics → `bss9aahmad14` (unique).
- Roll numbers come from `sections.next_roll_number` (sequential, gaps kept, sticky).
- Regenerated at promotion/transfer (class/section segment) and at renumbering (roll segment). No history, no notification.
- **Renumber** (Class Incharge for own section, School Admin for any): preview shows the before/after mapping and the count of usernames that will change; requires typed confirmation; runs in one transaction; full mapping goes to the audit log.

### 8.2 Attendance (student)

- **Teacher flow (PWA):** roster cached in IndexedDB on login → taps change local state only → "Submit" warns if any student is unmarked → batch queued with `client_uuid` + local timestamp (`pending_sync`) → sent immediately if online, otherwise via Background Sync (Chromium) or poll-on-reconnect/app-open (Safari/Firefox).
- Submit button is disabled while a batch for the same key is pending.
- **Server:** one transaction re-validates auth, tenant, assignment to section (+subject in per-period mode), that every student belongs to the section, and that the date is not in the future. Duplicate `client_uuid` → returns the original result (idempotent). Same key from a different device → last-write-wins by server time, both attempts audited. Marked `synced_late` if received after the school day ends; the UI shows both timestamps.
- **Corrections:** the submitter can edit while `now < end_of_day(date + 3 days)` in school timezone. After that, School Admin only. Class Incharge has read/write on their section's grid (subject to the same window). Every edit stores before/after in audit.
- **Percentages** are computed at read time with `COUNT(*) FILTER (...)`, never stored.
- **At-risk alerts:** daily cron computes per-student % for the current year → in-app notification to student, Class Incharge and admin dashboard (once per threshold crossing, not daily spam).

### 8.3 Teacher attendance

One-tap check-in on the "Today" view (`checked_in_at` = server time; client time kept if queued offline). Admin/Principal daily board shows who checked in, with direct correction at any time (audited).

### 8.4 Assessments, marks, grades, remarks

- Teacher creates an assessment for an assigned section+subject → enters marks (draft, autosaved locally) → **submit** (batch, validated 0..max) → `submitted_at` starts a **7-day** edit window for that teacher → School Admin (or Principal if `marks_publisher=principal`) **publishes** → visible to student.
- Grades are derived from the year's grading scheme version at read time; schemes are immutable once an assessment references them (editing creates a new version for future assessments).
- Remarks: teacher writes → Class Incharge moderates for own section; School Admin moderates school-wide. Only approved remarks appear to students and on report cards.

### 8.5 Leave

Types configurable per school. Routing per D5. Approver can't be the applicant (Principal-as-teacher runtime check). Approved student leave shows as `leave` on the attendance grid suggestion.

### 8.6 Timetable

School Admin defines the period grid, then assigns entries per section. DB unique constraints prevent section and teacher double-booking; the API turns violations into a readable 409 naming the clash. Stored per section, never per student. Views: section, teacher ("my timetable") and student (via their section).

### 8.7 Promotion & year close

1. Admin prepares next academic year (wizard: **copy class/section structure**, assign Class Incharges).
2. Choose scope: whole school / class / section / individual; map source section → target section; mark students as promoted / repeat / graduated / withdrawn.
3. Submit → creates a `promotion` job. For each student, in chunks:
   - move placement (roll number unchanged) and regenerate username;
   - generate report-card PDF (marks + grades + attendance % + approved remarks) → upload to `reports/{tenant}/{year}/{student}-report-card.pdf` → record in `report_cards` with checksum.
4. After all PDFs are verified (and the D9 grace period), a cleanup job deletes that year's attendance/marks rows.
5. Mid-year withdrawal: no report card, standard retention path (D7).

Progress UI shows per-student status and is resumable after failure.

### 8.8 Bulk Excel import

Download template → upload → server-side parse in a worker with caps → **preview** (valid rows, row-level errors) → commit as a job with idempotency key → creates students with generated usernames and temporary passwords → downloadable credentials sheet (shown once) → `must_change_password` on first login.

### 8.9 Search

- Teacher: students in assigned sections only.
- School Admin: students + teachers school-wide, optional class/section filter; guardian phone lookup.
- Admissions Officer: students school-wide + guardian phone lookup.
- Principal: students school-wide, read-only, always granted.
- Platform Owner: tenants by name/metadata only.

All use pg_trgm similarity, paginated at 20, and every row shows class/section + username to disambiguate same names.

### 8.10 Reports & dashboards

Role dashboards: today's attendance completion by section, at-risk students, pending leaves, unpublished assessments, teacher check-ins. Reports: attendance by section/date range, marks summary by assessment, at-risk list. CSV export with formula neutralization; guardian fields excluded unless School Admin.

### 8.11 Notifications & announcements

In-app only, behind a `NotificationChannel` interface so email/SMS can plug in later. Announcements target all / role / section.

### 8.12 Platform console

Tenant CRUD + suspend/reactivate (suspension blocks all tenant logins and revokes sessions), create the first School Admin, plans/subscriptions, usage counters, platform-admin management with scoped permissions, **support grant** request/approve/revoke, platform audit view, health page.

### 8.13 Archival jobs

- Monthly: per tenant, export last month's `audit_logs` → gzip JSON → `audit-archives/{tenant}/{yyyy-mm}.json.gz` → verify → delete via SECURITY DEFINER function.
- Daily: at-risk check, expired reset tokens/sessions cleanup, 30-day soft-delete purge, leave age-out escalation.

---

## 9. API surface (v1)

Real versioned routes under `src/app/api/v1/` (no rewrite alias). All list endpoints are paginated (`?cursor=&limit=20`) with explicit filters.

| Area       | Endpoints                                                                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Auth       | `POST /auth/{student                                                                                                                                                                                   | staff | platform}/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password`, `POST /auth/forgot-password`, `POST /auth/reset-password` |
| Users      | `POST /users` (school staff accounts), `POST /users/:id/reset-password`, `POST /users/:id/deactivate`                                                                                                  |
| Students   | `GET/POST /students`, `GET/PATCH/DELETE /students/:id`, `POST /students/:id/restore`, `POST /students/:id/transfer`, `POST /students/:id/photo`, `GET /students/search`                                |
| Imports    | `POST /imports/students` (upload+preview), `POST /imports/:id/commit`, `GET /imports/:id`                                                                                                              |
| Teachers   | `GET/POST /teachers`, `GET/PATCH /teachers/:id`, `PUT /teachers/:id/assignments`, `POST /teachers/:id/photo`                                                                                           |
| Structure  | `academic-years`, `classes`, `sections` (`PATCH /sections/:id/class-teacher`, `POST /sections/:id/renumber`), `subjects`                                                                               |
| Attendance | `GET /attendance/roster`, `POST /attendance/batches`, `PATCH /attendance/records/:id`, `GET /attendance/grid`, `POST /teacher-attendance/check-in`, `GET/PATCH /teacher-attendance`                    |
| Leave      | `GET/POST /leaves`, `POST /leaves/:id/decision`, `GET/POST /leave-types`                                                                                                                               |
| Assessment | `GET/POST /assessments`, `PUT /assessments/:id/marks`, `POST /assessments/:id/submit`, `POST /assessments/:id/publish`, `GET/POST /grading-schemes`, `GET/POST /remarks`, `POST /remarks/:id/moderate` |
| Timetable  | `GET/PUT /timetable/slots`, `GET/POST/DELETE /timetable/entries`                                                                                                                                       |
| Promotion  | `POST /promotions` (creates job), `GET /promotions/:id`, `GET /report-cards/:studentId` (signed URL)                                                                                                   |
| Comms      | `GET/POST /announcements`, `GET /notifications`, `POST /notifications/read`                                                                                                                            |
| Reports    | `GET /reports/attendance`, `/reports/marks`, `/reports/at-risk`, `GET /exports/:type`                                                                                                                  |
| Audit      | `GET /audit-logs`                                                                                                                                                                                      |
| Settings   | `GET/PATCH /settings`, `GET/PUT /settings/permissions`                                                                                                                                                 |
| Platform   | `/platform/tenants`, `/platform/plans`, `/platform/admins`, `/platform/support-grants`, `/platform/audit-logs`, `/platform/health`                                                                     |
| Internal   | `/internal/cron/*`, `/internal/jobs/run` (secret-protected)                                                                                                                                            |

---

## 10. Testing strategy

| Layer                   | Tool                                          | What                                                                                                                                                                                                                                                                                                             |
| ----------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                    | Vitest                                        | Username generation/normalization, correction-window math across timezones/DST, grading bands, permission resolution, formula neutralization.                                                                                                                                                                    |
| Integration             | Vitest + real Postgres (Docker service in CI) | Services against the real schema **with RLS on and the app connecting as `app_user`**.                                                                                                                                                                                                                           |
| **Authorization suite** | Vitest, table-driven                          | For **every protected endpoint × every role**: (a) allowed own-tenant case, (b) same-tenant peer record it shouldn't see (e.g. teacher → unassigned section), (c) cross-tenant record → 404. Timetable and report endpoints included explicitly. A CI check fails if a route exists without an authz test entry. |
| RLS suite               | SQL-level tests                               | Queries without `app.tenant_id` return zero rows; wrong tenant returns zero; `app_user` can't UPDATE/DELETE `audit_logs`.                                                                                                                                                                                        |
| E2E                     | Playwright                                    | Login per role, forced password change, attendance offline → reconnect → sync, marks submit/publish, promotion job, import preview/commit.                                                                                                                                                                       |

**Definition of done for any endpoint:** zod schema, `defineRoute` with permission, service-level scope check, audit entry if sensitive, authz test rows, and a happy-path integration test.

---

## 11. Delivery phases & milestones

Follows spec §13, with a Phase 0 for setup. Each phase ends with a demo against the seed data (two schools) and its acceptance criteria passing in CI.

### Phase 0 — Project setup (≈1 week)

- Next.js 15 + TS strict + Tailwind/shadcn, ESLint/Prettier, path aliases.
- Docker Compose Postgres + devcontainer (local ↔ Codespaces flag).
- Vitest + Playwright scaffolding; GitHub Actions CI (lint, typecheck, unit, integration with Postgres service, build); Dependabot + CodeQL.
- `.env.example`, env validation with zod (fail fast), Sentry stub.
- **Done when:** CI is green on an empty app; `docker compose up && npm run dev` works.

### Phase 1 — Foundation (≈2–3 weeks)

- Full Prisma schema for Tenancy + Identity (+ empty shells for later tables), migrations, **RLS policies, `app_user` role, audit grants**.
- `defineRoute` pipeline, `withTenant`, error model, pagination helper.
- Auth: login (username/email), Argon2id, sessions, lockout, logout, change password, forced change, reset flows (D1).
- Permission catalog + per-school toggles for Principal/Admissions.
- Platform Owner console: create/suspend tenants (unique prefix), create first School Admin.
- Role-aware dashboard shell & navigation; security headers.
- Audit logging for login/logout and all Phase 1 mutations.
- **Acceptance (spec):** a user can log in; the session persists securely; the user sees only the correct dashboard; cross-tenant access attempts are rejected **and logged**. Authz + RLS suites green.

### Phase 2 — School administration (≈3–4 weeks)

- Academic years, classes, sections, subjects, Class Incharge designation, "copy structure to next year".
- Staff accounts (Principal, Admissions Officer, Teachers), teacher assignments.
- Students: CRUD, soft delete + 30-day restore, guardian fields with visibility rules, section transfer, usernames & roll numbers.
- Profile photos: crop/preview → sniff → resize → StorageService (local/R2, private + signed URLs).
- Job framework (D4) + **promotion** with username regeneration and report-card PDF archival.
- **Acceptance:** an admin can stand up a school year end-to-end and promote a section; PDFs land in storage; usernames update; all actions audited; authz tests for every new route.

### Phase 3 — Academic operations (≈4–5 weeks)

- Student attendance: batch submit, idempotency, grid, 3-day window, Class Incharge grid, attendance mode setting.
- **PWA**: Serwist shell, Dexie queue, background sync/poll fallback, `synced_late`, logout wipe.
- Teacher self check-in + admin daily board.
- Leave types, requests, routing, age-out.
- Assessments, marks lifecycle (draft/submit/publish), 7-day window, grading schemes, remarks + moderation.
- Timetable slots/entries with DB-level conflict prevention.
- **Acceptance:** a teacher can take attendance in airplane mode and it syncs correctly; edits outside windows are refused for teachers and allowed for School Admin; every edit has before/after audit.

### Phase 4 — Management operations (≈3 weeks)

- Dashboards & alerts (at-risk cron), reports, CSV exports.
- Announcements, in-app notifications.
- Bulk Excel import with full §9.5 hardening, preview, credentials sheet.
- Search for all role scopes (pg_trgm).
- Audit log viewer with filters.
- **Acceptance:** importing 500 students works with preview and row errors; a malicious workbook (formula cells, zip bomb) is rejected; search scopes verified by authz suite.

### Phase 5 — Production hardening (≈2–3 weeks)

- Break-glass support grants (request → approve → time-boxed → auto-expire → visible in tenant audit).
- Monthly audit archival, promotion data cleanup jobs, retention/anonymization (D7).
- CSP tightening, rate-limit review, Sentry wired with scrubbing, dependency scanning gates.
- Full IDOR test sweep, load test with a 1,000-student school, backup plan (deferred in spec, **required before real school data**), privacy policy/ToS placeholder.
- **Acceptance:** spec §15 checklist fully ticked.

**Rough total:** 15–20 weeks for one full-time developer. Phases 3 and 4 can partly overlap.

---

## 12. Environments, CI/CD & hosting

| Env                | Hosting                                                 | DB                                                       | Storage           |
| ------------------ | ------------------------------------------------------- | -------------------------------------------------------- | ----------------- |
| Local / Codespaces | `next dev`                                              | Docker Postgres 16                                       | Local disk        |
| Preview (per PR)   | Vercel preview                                          | Supabase branch or shared staging DB                     | R2 staging bucket |
| Demo / dev         | Vercel (D8)                                             | Supabase (pooler URL for app, direct URL for migrations) | R2 private bucket |
| Production         | **TBD, host-portable** (Docker image from `Dockerfile`) | Supabase or any managed Postgres 16                      | R2 private bucket |

- **CI (required before merge):** lint → typecheck → unit → integration/authz/RLS (Postgres service) → build → Playwright smoke. Migrations applied in CI from scratch every run.
- **CD (demo):** Vercel Git integration: PR → preview; merge to `main` → demo deployment. Production CD is defined once the production host is chosen; CI already builds the Docker image. Migrations run via a gated GitHub Action job (`prisma migrate deploy`) before promotion.
- **Branch protection on `main`:** PR required, CI required, no force push.
- **Secrets** only in Vercel/GitHub encrypted env; never `NEXT_PUBLIC_*` for anything sensitive.

---

## 13. Risks & mitigations

| Risk                                                | Mitigation                                                                                                                 |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| RLS misconfiguration silently disables isolation    | App role without BYPASSRLS; RLS test suite in CI; a migration lint that fails if a table with `tenant_id` lacks a policy.  |
| Promotion deletes data and a PDF bug is found later | Verified upload + checksum, D9 grace period, PDF snapshot tests.                                                           |
| Serverless timeouts on bulk work                    | Job framework (D4); chunked processing; resumable.                                                                         |
| Offline sync conflicts / duplicates                 | `client_uuid` idempotency, DB unique keys, last-write-wins with full audit.                                                |
| Background Sync unsupported on iOS Safari           | Poll-on-reconnect and app-open sync fallback; visible "pending" badge.                                                     |
| Free-tier limits (Supabase 500 MB, Vercel Hobby)    | Vercel is demo-only (D8); archival keeps DB flat; usage counters; production host chosen before onboarding paying schools. |
| Username changes lock students out                  | Admin/Principal search by name shows current username; credentials slip after promotion (printable).                       |
| Single School Admin locked out                      | Platform Owner break-glass flow can reset the School Admin (audited, tenant-visible).                                      |

---

## 14. Out of scope (v1)

Universities · fees & defaulters · payroll/HR/employees · homework · ID cards & certificates · Urdu localization · native mobile app · SMS/WhatsApp · AI insights/remarks · academic calendar/holidays · biometric/RFID · in-app chat · parent portal/login · MFA.

---

## Next step

Phase 0 + Phase 1 are being delivered as one pull request with CI green; later phases follow as their own pull requests.
