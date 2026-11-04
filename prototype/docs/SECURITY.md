# Security Notes

## Request pipeline

HTTPS -> rate limiting/lockout -> authentication -> session validity -> tenant resolution -> role/permission -> input validation -> business rules -> tenant-scoped query -> audit -> response.

## Authentication

- Login accepts username or email.
- Username lookup uses a stored normalized value: lowercase, separators removed.
- Passwords are hashed with bcrypt in this development build. Production should replace bcrypt hashing with Argon2id before real school data is onboarded.
- Sessions use random opaque tokens stored as SHA-256 hashes in PostgreSQL and an HTTP-only cookie.
- 5 failed password attempts lock the account for 15 minutes.
- Logout revokes the server-side session row.
- Password changes, role changes, and deactivation must revoke sessions in the production hardening pass.

## Tenant isolation

Every tenant-owned record has `tenantId`. Every protected server route resolves the tenant from the authenticated user rather than trusting a browser-supplied tenant ID.

For production, Supabase PostgreSQL Row Level Security (RLS) must be enabled on every tenant-scoped table. This repository currently contains application-layer tenant scoping; RLS policies must be added in the Supabase deployment migration before production use.

## Audit

Sensitive mutations write `audit_logs`. Never log passwords, cookies, session tokens, DB credentials, R2 secrets, or other secrets.

## Uploads

The photo editor creates a square WebP preview before the final save. The API accepts only the processed WebP data URL and caps the final object at 150 KB. Production should also content-sniff the binary, enforce pixel/dimension limits, and store R2 objects under generated keys.

## Excel imports

The prototype enforces a file-size and row-count cap and rejects values beginning with `=`, `+`, `-`, or `@`. Before production, add full formula-injection sanitation on import and export, decompressed ZIP/cell limits, parser isolation, and an idempotent import job model.

## Break-glass support access

The intended production model is time-boxed, reason-coded, tenant-visible support access approved by the Platform Owner. This prototype does not yet implement the complete impersonation/grant workflow.

## Production gate

Do not use the prototype for official student records until RLS, Argon2id, complete role/permission tests, R2 private access, backups, security headers/CSP/HSTS, support grants, dependency scanning, and end-to-end authorization tests are complete.
