# Education SaaS - Web Prototype

A browser-only multi-tenant school management SaaS prototype built with Next.js App Router, serverless route handlers, Prisma, PostgreSQL, and storage abstraction ready for Cloudflare R2.

## Scope

School-only v1. The application intentionally excludes universities, parents, fees, payroll, AI insights, SMS/WhatsApp, white-label domains, MFA, homework, certificates, chat, and native mobile apps.

Teacher attendance uses the web app as an installable PWA shell and supports an offline local queue for batch attendance. The current prototype queue syncs on reconnect during page activity; production should use IndexedDB + Background Sync as described in `docs/SECURITY.md`.

## Requirements

- Node.js 22 LTS recommended
- PostgreSQL 18 recommended
- Windows PowerShell, macOS, Linux, or GitHub Codespaces/devcontainer

Docker is optional; this project can use PostgreSQL installed directly on Windows.

## First run on Windows

1. Create `.env` from `.env.example` and set `DATABASE_URL`.
2. Install dependencies:

```powershell
npm install
```

3. Generate Prisma Client:

```powershell
npx prisma generate
```

4. For an existing development database that was created from an older prototype, reset it before seeding:

```powershell
npx prisma migrate reset --force
```

Do not run that command against a production database.

5. Create/apply the current database schema:

```powershell
npx prisma migrate dev --name init
```

6. Seed demo data:

```powershell
npm run prisma:seed
```

7. Start the app:

```powershell
npm run dev
```

Open `http://localhost:3000`.

## Demo accounts

Platform Owner
- username: `platform-owner`
- password: `ChangeMe123!`

School Admin
- username: `BSS-admin`
- password: `Admin123!`

Teacher
- username: `BSS-alikhan`
- password: `Teacher123!`

Student
- username: `BSS-8-A-ahmad-14`
- password: `Student123!`

These are development-only credentials.

## Cloud prototype target

- Frontend + serverless API: Vercel
- Database: Supabase PostgreSQL
- Files/photos: Cloudflare R2
- DNS/TLS/CDN: Cloudflare
- Source control/CI: GitHub
- Error monitoring: Sentry

Set `STORAGE_DRIVER=r2` and provide R2 credentials in the server environment when deploying.

## Architecture

Browser -> Next.js serverless API -> authorization/tenant scope -> Prisma -> PostgreSQL

Profile photos: browser crop/preview -> API -> resize/compress -> storage service -> local uploads or R2

The browser is untrusted. Tenant IDs, roles, and resource IDs are never accepted as authoritative security inputs.
