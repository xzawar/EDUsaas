# EDUsaas — School Management System

Multi-tenant school management SaaS: one school = one tenant. Students, teachers and school staff each sign in through their own portal; the Platform Owner runs the SaaS from a separate console.

| Document                                                                                               | What it is                                                                                 |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| [`docs/PLAN.md`](docs/PLAN.md)                                                                         | Master plan: gap analysis, confirmed decisions, architecture, data model, security, phases |
| [`docs/spec/Education_SaaS_Final_Specification.pdf`](docs/spec/Education_SaaS_Final_Specification.pdf) | Final specification (single source of truth)                                               |
| [`prototype/`](prototype)                                                                              | Original prototype, kept for UI/flow reference only (not built)                            |

## Status

| Phase                                                                                       | State   |
| ------------------------------------------------------------------------------------------- | ------- |
| 0 — Project setup, CI, Docker                                                               | ✅ Done |
| 1 — Foundation: RLS, roles, separate login portals, sessions, permissions, platform console | ✅ Done |
| 2 — School administration (years, classes, sections, teachers, students, promotion)         | Next    |
| 3 — Academic operations (attendance + offline PWA, leave, marks, timetable)                 | Planned |
| 4 — Management operations (reports, import, search, announcements)                          | Planned |
| 5 — Production hardening (break-glass, archival, monitoring)                                | Planned |

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

The seed refuses to run when `NODE_ENV=production`.

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

Demo on Vercel + Supabase:

1. In Supabase SQL editor (or with the `postgres` connection string as `DIRECT_URL`), run `npx prisma migrate deploy` then `npm run db:roles` with `DB_APP_PASSWORD` and `DB_SYSTEM_PASSWORD` set.
2. In Vercel set `DATABASE_URL` (pooler URL, user `edusaas_app_login`, add `?pgbouncer=true`), `SYSTEM_DATABASE_URL` (pooler, `edusaas_system_login`), `DIRECT_URL` (direct, `postgres`), `APP_URL` and a random 32+ character `CRON_SECRET`.
3. `vercel.json` schedules `/api/internal/cron/daily`. Vercel sends `Authorization: Bearer $CRON_SECRET` automatically; any other scheduler can call the same URL the same way.
