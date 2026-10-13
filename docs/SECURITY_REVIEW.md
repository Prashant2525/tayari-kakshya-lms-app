# Security Review — Phase 15

Date: 2026-10-12 · Branch: `feature/security-hardening` · Scope: the playbook's Phase 15 list (authentication,
authorization, RBAC, IDOR/BOLA, input validation, file uploads, payment verification, rate limits, token storage,
logging of secrets, admin privilege escalation, premium access, API error leakage, database safety, audit logs), plus
dependencies and HTTP security headers. Method: reading the code paths, an automated route inventory, targeted
tests for every fix, and a mutation check (each fix undone → its test fails).

## Summary

| # | Finding | Severity | Status |
|---|---|---|---|
| F-1 | Staff two-factor step limited per IP only: with a stolen password, codes could be guessed from many addresses | Medium | **Fixed** — at most 5 code attempts per sign-in (each sign-in needs the password, 5 per 15 min per account) |
| F-2 | Staff 2FA policy (`auth.staffMfa`) changeable by any staff with `settings:update`, not only a Super Admin | Medium | **Fixed** — Super Admin only (registry flag `superAdminOnly`; API refuses, CMS shows it read-only) |
| F-3 | `TRUST_PROXY=true` trusts `X-Forwarded-For` from anyone: a caller reaching the API directly could fake its IP and dodge per-IP limits | Medium (deployment) | **Fixed** — accepts the proxies' addresses / CIDR ranges; `true` refused in staging and production |
| F-4 | Account erasure (D-032) kept lesson progress and live-class attendance, and the student's text in question reports | Medium (privacy) | **Fixed** — erased / cleared; a guard test fails when a new table with a user column is neither erased nor deliberately kept |
| F-5 | Request logs recorded secret query values (signed receipt links, eSewa payload, Khalti pidx) | Low | **Fixed** — values of secret parameters redacted in logs |
| F-6 | Critical advisory in `shell-quote` (React DevTools, app dev tooling); no dependency audit in CI | Low | **Fixed** — pinned to the patched release; CI fails on high / critical advisories |
| F-7 | Website sent no Content-Security-Policy | Low | **Partly fixed** — `base-uri 'self'; object-src 'none'; frame-ancestors 'none'`; script restrictions need nonces (R-3) |

No critical or high-severity issue was found in the application code.

## Area by area

### Authentication
- Passwords: argon2id (19 MiB, t=2), constant-time dummy verify for unknown accounts; reset / forgot do not reveal
  whether an account exists.
- Access tokens: HS256 pinned, issuer + audience (`student` / `staff`) checked, 15 min by default; every request
  re-checks the session and the account in the database (sign-out, suspension and password reset apply at once).
  The staff MFA challenge token uses a separate audience and is refused as an access token (tested).
- Refresh tokens: random 256-bit, stored as peppered HMAC, rotated, reuse detected (existing tests).
- Staff refresh token: HttpOnly, `SameSite=Strict`, `Secure` in staging/production, scoped path, plus a required
  custom header (CSRF). Secrets in `.env` must be ≥ 32 characters (validated at start-up).
- One-time codes: peppered hash, expiry, attempt cap per code; TOTP codes cannot be replayed (step tracking).
- **F-1 fixed**: `POST /admin/auth/login/mfa` also limited per sign-in (`body.mfaToken`, 5 per 15 min).

### Authorization and RBAC
- Default deny: every route needs a token unless marked `@Public()`.
- **New guard test** (`route-security.e2e.test.ts`) over all 345 routes: the public routes are an explicit list;
  every `/admin` route is staff-only and needs a permission except the staff member's own sign-out and 2FA set-up;
  every other signed-in route is student-only except five shared account routes. A new route that breaks these
  rules fails CI.
- Roles: a role editor can only grant permissions they hold; only a Super Admin grants the Super Admin role; the
  last active Super Admin cannot be removed or suspended; staff cannot suspend themselves; student management
  endpoints only touch student accounts.
- **F-2 fixed**: security-control settings are Super Admin only.
- Course scopes (T-028) are applied in 22 admin services (content, questions, assessments, grading, live classes,
  orders, refunds, exports, …).

### IDOR / BOLA
Every student route with an id looks the record up together with the caller's user id (attempts, answers, results,
orders, payment start, receipts, sessions, discussion posts, study plans, reviews, bookmarks, mistakes,
notifications, push tokens), or applies content access rules (lessons, PDFs, playback, live classes, practice
questions). Existing tests cover other students' attempts, orders and posts.

### Input validation
All request bodies go through Zod schemas (`@ZodBody`); no raw `@Body()`. Raw SQL is limited to analytics, locks
and a few counts; every value is a bound parameter (only code constants are interpolated).

### File uploads
Type from magic bytes, not the name; size limits per kind; images re-encoded to WebP (EXIF / payloads stripped,
pixel limit); PDFs private; storage keys generated by the server; one file per request, multipart limits.
Download file names are built from safe values or sanitised.

### Payment verification
Access is granted only in `settle`: after the gateway's server-side confirmation, for the exact amount, under a
per-order lock, idempotent; amount mismatches and duplicates are recorded and audited; eSewa redirects are
signature-checked; receipts are HMAC-signed, expiring links. Sandbox gateways are refused in production.

### Rate limits
Global per-IP default plus per-route limits on every sign-in, sign-up, OTP, reset, MFA, refresh, payment, export,
upload, search and write-heavy student route (Redis, shared by all instances). **F-3 fixed** so the IP is real.

### Token storage (clients)
App: Expo SecureStore (Keychain / Keystore). Website: HttpOnly, `SameSite=Lax`, `Secure` cookies; tokens never
reach browser scripts. CMS: access token in memory, refresh token in the HttpOnly cookie above. The app's web
build stores tokens in localStorage — it is for development and tests only and must never be deployed.

### Logging of secrets
Authorization / Cookie / Set-Cookie headers removed from logs; audit entries scrub secret-looking fields (and live
classes leave out links and passcodes). **F-5 fixed** for query strings. Sentry events are scrubbed (existing tests).

### Premium access
Enforced on the server: locked items return no body / answers / URLs; premium PDFs, playback, offline licences,
live-class links and recordings all check access; search returns titles and question stems only (the stored search
text holds the stem and options, which locked questions show anyway).

### API error leakage
One error format, no stack traces, generic 500 message; database errors mapped to generic 404 / 409.

### Database safety
Migrations with foreign keys, CHECK constraints and indexes; financial records (orders, payments, refunds,
invoices, entitlements) and audit logs are never deleted. **F-4 fixed** for erasure completeness.

### Audit logs
Every staff write and every financial state change is audited (services without audit calls are student-side or
system jobs). Audit records are never deleted.

### Dependencies and headers
`pnpm audit --prod`: the critical `shell-quote` advisory fixed by an override; CI now runs
`pnpm audit --prod --audit-level high`. API: Helmet (CSP in staging / production), strict CORS allow-list. Website:
nosniff, frame denial, referrer and permissions policies, and now a basic CSP (**F-7**).

## Remaining risks (accepted for now, to revisit)

| # | Risk | Why it remains | Plan |
|---|---|---|---|
| R-1 | Two high advisories in the app's build tooling: `node-forge` (GHSA-86w9-cpqp-85rv, Expo CLI) and `braces` (GHSA-vfj7-8cjw-p6xm, Metro); moderate `decode-uri-component` (expo-router deep links, a self-DoS at worst) and `uuid` via exceljs (buffer variant not used) | No fixed release / not reachable at runtime | Ignored by id in `pnpm-workspace.yaml`; remove when Expo ships fixes |
| R-2 | Admin CMS security headers (CSP, frame-ancestors, HSTS) are not set — it is plain static files | Belong to the web server config | **Done (Phase 18)**: Caddy sends HSTS on every address and a strict CSP (own scripts only, no eval) + frame-ancestors 'none' on the CMS; checked in the local rehearsal |
| R-3 | Website CSP does not restrict scripts | Next.js inline scripts need per-request nonces | Revisit with nonce-based CSP before launch if time allows |
| R-4 | The database user and network exposure (Postgres / Redis only on the private network; API port only to the proxy) | Deployment | **Done (Phase 18)**: only the proxy publishes ports; PostgreSQL, Redis (password), API and website are on the private network |
| R-5 | Staff accounts without 2FA when the policy is `super_admins` | Owner choice of policy | Owner may switch to "All staff" in Settings (Super Admin only) |
| R-6 | Load / abuse testing of the weekly-exam burst | Phase 16 | Phase 16 load test |
