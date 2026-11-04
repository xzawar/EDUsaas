# EDUsaas — School Management System

Multi-tenant school management SaaS: one school = one tenant. Students, teachers and school staff each sign in through their own portal; the Platform Owner runs the SaaS from a separate console.

| Document                                                                                               | What it is                                                                                 |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| [`docs/PLAN.md`](docs/PLAN.md)                                                                         | Master plan: gap analysis, confirmed decisions, architecture, data model, security, phases |
| [`docs/spec/Education_SaaS_Final_Specification.pdf`](docs/spec/Education_SaaS_Final_Specification.pdf) | Final specification (single source of truth)                                               |
| [`prototype/`](prototype)                                                                              | Original prototype, kept for UI/flow reference only (not built)                            |

## Status

| Phase                                                                                                                                                              | State   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| 0 — Project setup, CI, Docker                                                                                                                                      | ✅ Done |
| 1 — Foundation: RLS, roles, separate login portals, sessions, permissions, platform console                                                                        | ✅ Done |
| 2 — School administration: sidebar app, role dashboards, years/classes/sections/subjects, teachers + assignments, staff accounts, students, renumbering, promotion | ✅ Done |
| 3 — Academic operations (attendance + offline PWA, leave, marks, timetable)                                                                                        | Next    |
| 4 — Management operations (reports, import, search, announcements)                                                                                                 | Planned |
| 5 — Production hardening (break-glass, archival, monitoring)                                                                                                       | Planned |

## Sign-in portals

| Portal           | URL               | Who                                                   | Signs in with                      |
| ---------------- | ----------------- | ----------------------------------------------------- | ---------------------------------- |
| Student Portal   | `/login`          | Students (parents use the student's account)          | Username, e.g. `bss-8a-ahmad-14`   |
| Staff Portal     | `/staff/login`    | Teachers, School Admin, Principal, Admissions Officer | Teachers: username · Office: email |
| Platform Console | `/platform/login` | Platform Owner, Platform Admin                        | Email                              |

A valid account used on the wrong portal is rejected with the same generic error, and a session from one portal never opens another portal's pages.

## Quick start (local)

Requirements: Node.js 22, PostgreSQL 16 (local install or `docker compose up -d db`).

```bash
cp .env.example .env
```

```bash
npm ci
```

```bash
npx prisma migrate deploy && npm run db:roles && npm run db:seed
```

```bash
npm run dev
```

Open http://localhost:3000.

`db:roles` creates the two runtime database logins (see [Security model](#security-model)). Run it again after resetting the database.

### Demo accounts (development only)

Password for every demo account: `Demo-pass-2026`

| Portal   | Account               | Role                                              |
| -------- | --------------------- | ------------------------------------------------- |
| Student  | `bss-8a-ahmad-14`     | Student, Bright Star School                       |
| Staff    | `bss-t-alikhan-1`     | Teacher                                           |
| Staff    | `admin@bss.test`      | School Admin                                      |
| Staff    | `principal@bss.test`  | Principal                                         |
| Staff    | `admissions@bss.test` | Admissions Officer                                |
| Staff    | `admin@gvs.test`      | School Admin, Green Valley School (second tenant) |
| Platform | `owner@edusaas.test`  | Platform Owner                                    |
| Platform | `ops@edusaas.test`    | Platform Admin                                    |

The seed refuses to run when `NODE_ENV=production` unless `DEMO_SEED=true`. Bright Star School is a full demo school: 2026-27 with Prep + classes 1–10 (21 sections), 22 teachers (each signs in as `bss-t-<name>-1`, e.g. `bss-t-saimaakhtar-1`), and 444 students; 2027-28 is empty so you can try **Copy structure** and **Promotion**.

New database migrations are created with `npm run db:new-migration -- <name>` (a schema diff against the dev database), then reviewed for RLS/grants before `npx prisma migrate deploy`.

## Commands

| Command                                       | What it does                                                       |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `npm run dev`                                 | Development server                                                 |
| `npm run lint` / `typecheck` / `format:check` | Static checks                                                      |
| `npm test`                                    | Unit tests                                                         |
| `npm run test:integration`                    | RLS, authentication and authorization-matrix tests on `<db>_test`  |
| `npm run test:e2e`                            | Playwright browser tests (needs `npm run build` and the demo seed) |
| `npm run db:check-rls`                        | Fails if any table lacks forced RLS or an app-role policy          |
| `npm run db:reset`                            | Drop, migrate, recreate roles and reseed the dev database          |

## Security model

- **Row-Level Security on every table.** The app connects as `edusaas_app_login`, which is subject to RLS and owns no tables. Every tenant request runs inside `withTenant()`, which sets `app.tenant_id` for that transaction only. If the tenant is unset, queries return nothing.
- **A separate privileged role** (`edusaas_system_login`, BYPASSRLS) is used only for login/session checks, the platform console and audit writes. ESLint blocks importing it anywhere else.
- **The audit log is insert-only** for both runtime roles. Migrations run as the database owner, which the app never uses.
- **One request pipeline** (`defineRoute`) for every API route: origin check → session → tenant from session (never from the request) → permission → input validation → handler.
- Argon2id password hashing; HTTP-only SameSite cookies holding opaque tokens (only a hash is stored); lockout for 15 minutes after 5 failed attempts; sessions revoked on password change, reset, deactivation and school suspension; nonce-based CSP, HSTS and frame denial.
- The Platform Owner has **no** access to school data. Break-glass support access arrives in Phase 5.

## Deployment

**Vercel is for demo and development only** (decision D8). The app stays host-portable: `next build` produces a `standalone` server, and the [`Dockerfile`](Dockerfile) builds a production image that runs anywhere.

### Demo on Vercel + Supabase (about 10 minutes, no commands)

On Vercel, `npm run vercel-build` runs [`scripts/vercel-build.sh`](scripts/vercel-build.sh). It applies database migrations, creates the two runtime database logins, optionally loads the demo accounts, then builds. Every deploy keeps the database up to date on its own.

**1. Create the database (Supabase)**

1. At supabase.com, create a project. Pick a region near your users and save the database password.
2. Open **Connect** (top bar) and note your **project ref** (the `xxxx` in `db.xxxx.supabase.co`) and the **pooler host** (e.g. `aws-0-ap-south-1.pooler.supabase.com`).
3. Choose two new strong passwords for the app's database logins (letters and digits only keeps the URLs simple). Call them `APP_PW` and `SYSTEM_PW`.

**2. Import the repo into Vercel**

1. At vercel.com → **Add New… → Project** → import `xzawar/EDUsaas`. Framework preset: Next.js (detected). Leave the build command as the default.
2. Before clicking **Deploy**, open **Environment Variables** and add these (replace `REF`, `POOLER_HOST`, `DB_PASSWORD`, `APP_PW`, `SYSTEM_PW`):

| Name                  | Value                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| `DIRECT_URL`          | `postgresql://postgres.REF:DB_PASSWORD@POOLER_HOST:5432/postgres`                                             |
| `DATABASE_URL`        | `postgresql://edusaas_app_login.REF:APP_PW@POOLER_HOST:6543/postgres?pgbouncer=true&connection_limit=1`       |
| `SYSTEM_DATABASE_URL` | `postgresql://edusaas_system_login.REF:SYSTEM_PW@POOLER_HOST:6543/postgres?pgbouncer=true&connection_limit=1` |
| `DB_APP_PASSWORD`     | `APP_PW`                                                                                                      |
| `DB_SYSTEM_PASSWORD`  | `SYSTEM_PW`                                                                                                   |
| `CRON_SECRET`         | any random string of 32+ characters                                                                           |
| `APP_URL`             | `https://<your-project>.vercel.app` (set after the first deploy if you don't know it yet, then redeploy)      |
| `DEMO_SEED`           | `true` (loads the demo schools and accounts; leave unset for an empty platform)                               |

3. Click **Deploy**. When it finishes, open the URL and sign in with the [demo accounts](#demo-accounts-development-only).

Notes:

- `DIRECT_URL` uses Supabase's **session** pooler (port 5432) because the direct `db.REF.supabase.co` host is IPv6-only and Vercel builds use IPv4. The app itself uses the **transaction** pooler (port 6543).
- Through Supabase's pooler, every username carries `.REF` (e.g. `edusaas_app_login.abcd1234`).
- If the build stops at "Could not create/update edusaas_system_login (BYPASSRLS)", the `DIRECT_URL` user isn't allowed to create that role. Use the `postgres` user.
- `vercel.json` schedules `/api/internal/cron/daily` once a day. Vercel sends `Authorization: Bearer $CRON_SECRET` automatically, and any other scheduler can call the same URL the same way.
- Every pull request gets its own preview URL. Previews share the same demo database.
