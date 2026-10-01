# Test Status

Last updated: 2026-10-02 (Phase 4). Run everything with `pnpm test` (needs `pnpm infra:up`).

## Current results — all passing locally

| Package | Files | Tests | Kind |
|---|---|---|---|
| `@tk/domain` | 2 | 19 | Unit: BS/AD conversion (reference new years 2080–2082, full-year round-trip), validation, month lengths, Kathmandu day boundary, formatting (en/ne), fiscal year; money: VAT inclusive/exclusive, rounding, discounts, parsing, NPR formatting |
| `@tk/contracts` | 1 | 5 | Unit: localized text, email normalization, password policy, mass-assignment rejection, settings defaults valid |
| `@tk/api` | 4 | 51 | Integration against **real PostgreSQL + Redis** through the real HTTP stack (Fastify inject) + RBAC unit tests |
| **Total** | **7** | **75** | |

### API coverage
- **Auth:** register (+ verification email), duplicate email (case-insensitive), validation error format + request id, identical errors for wrong password / unknown email, staff blocked on student login, suspended accounts, per-account login rate limit (429).
- **Refresh tokens:** rotation; reuse of a rotated token revokes the session (theft detection, audited); unknown tokens.
- **Sessions:** logout invalidates the access token immediately; list/revoke own sessions; cannot revoke another user's session; same-device re-login replaces the session.
- **Device limit:** off by default; block mode with session list + `replaceSessionId`; revoke-oldest mode; per-user override.
- **Profile/password:** allowed fields only; changing the password signs out other devices.
- **OTP:** email verification; newest code only; 5-attempt lockout; resend cooldown; codes stored hashed; phone channel toggle; phone stored only after verification; phone uniqueness.
- **Password reset:** OTP flow revokes all sessions, verifies email, single-use code; unknown email indistinguishable.
- **Google:** create, reuse, link to existing student, reject invalid/unverified tokens, never link to staff.
- **Account deletion:** 7-day schedule, other devices signed out, cancel, erasure after grace (PII cleared, sessions deleted, audited, email reusable).
- **Admin/RBAC:** HttpOnly SameSite=Strict scoped cookie; `X-TK-Client` header required; student/staff audience separation (both directions); permission checks; `/me` permissions; privilege escalation blocked; only a Super Admin grants Super Admin; Super Admin role and last Super Admin protected; assigned roles cannot be deleted; staff invitation + password setup; student suspension revokes sessions + audit; cursor pagination; settings validation + audit; maintenance-mode scope.

### Verification beyond tests
- Mutation check: disabling the escalation rule fails 3 tests (tests are not vacuous).
- Manual smoke: API boots (NestJS 12 / Fastify, ESM); `/health/ready` (DB + Redis); `/app/config`; OpenAPI at `/api/docs` (35 paths); worker registers BullMQ schedulers and completes jobs; CLI `create-super-admin` sends a setup code delivered to Mailpit over SMTP.

## Not yet covered
- GitHub Actions run (KI-017).
- Load testing (Phase 16); payments, exams, content (later phases).
