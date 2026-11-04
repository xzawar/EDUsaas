# EDUsaas — School Management System

Multi-tenant school management SaaS: one school = one tenant. Built for School Admins, Principals, Admissions Officers, Teachers and Students, with a Platform Owner console for running the SaaS.

**Status:** Planning. See the master plan before any code is written.

| Document | What it is |
|---|---|
| [`docs/PLAN.md`](docs/PLAN.md) | Master implementation plan: prototype gap analysis, open decisions, architecture, data model, security design, phases |
| [`docs/spec/Education_SaaS_Final_Specification.pdf`](docs/spec/Education_SaaS_Final_Specification.pdf) | Final reconciled specification (single source of truth) |
| [`prototype/`](prototype) | Original working web prototype, kept for UI/flow reference only. Not built or deployed. |

## Planned stack

Next.js 15 (App Router + route handlers) · TypeScript · Prisma · Supabase PostgreSQL with Row-Level Security · Cloudflare R2 · PWA (Serwist + IndexedDB) for offline teacher attendance · Vercel · Sentry · Vitest + Playwright.

## v1 modules

Authentication · Students & teachers · Classes, sections & academic years · Student & teacher attendance · Leave · Tests, marks, grades & remarks · Timetable · Promotion & report cards · Reports & alerts · Bulk Excel import · Search · Audit logs · In-app notifications · Platform console.
