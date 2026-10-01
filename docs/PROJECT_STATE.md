# Project State

Current Phase: **Phase 4 — Monorepo + backend foundation: COMPLETE (verified locally)**
Current Milestone: PR review for `feature/foundation` → Phase 5 Admin CMS foundation
Overall Status: **IN PROGRESS**
Last updated: 2026-10-02

## Completed
- Phases 0–3: discovery, PDF extraction, decisions, approved architecture (merged to `main` via PR #1, #2).
- Phase 4 (branch `feature/foundation`):
  - Monorepo: pnpm 12 + Turborepo, TypeScript 6.0, Prettier/ESLint, CI workflow.
  - Local infra: Docker Compose (PostgreSQL 17 + test DB, Redis 7.4, Mailpit).
  - `@tk/domain`: BS calendar (conversion, validation, formatting, fiscal year, Kathmandu day), money/VAT/discount math.
  - `@tk/contracts`: error codes, localized text, auth/admin schemas, settings registry, permission catalog.
  - `@tk/api`: NestJS 12 on Fastify (ESM) + Prisma 7; auth (email/password, Google, OTP verification, password reset,
    refresh rotation with reuse detection, sessions, device limit, deletion + erasure), staff auth with cookie refresh,
    RBAC with escalation protection, Super Admin CLI, student administration, settings, audit log, maintenance mode,
    rate limiting, health checks, OpenAPI; worker (BullMQ) with erasure and cleanup jobs.
  - 75 automated tests passing (see `TEST_STATUS.md`).

## In Progress
- Owner review of the Phase 4 PR; first GitHub Actions run.

## Remaining
- Phases 5–18 (`IMPLEMENTATION_PLAN.md`).

## Files Changed (Phase 4)
- New: root workspace config, `infra/docker/*`, `.github/workflows/ci.yml`, `packages/{config,domain,contracts}`, `apps/api`.
- Updated: README (UTF-8), `.env.example`, `.gitignore`, docs.

## Database Changes
- Migration `init_identity_access`: extensions `citext`, `pg_trgm`; tables `users`, `auth_identities`, `auth_sessions`,
  `auth_refresh_tokens`, `otp_codes`, `account_deletion_requests`, `education_levels`, `roles`, `role_permissions`,
  `user_roles`, `staff_scopes`, `system_settings`, `audit_logs`.

## API Changes
- 35 endpoints under `/api/v1` (auth, me, app config, health, admin auth, roles/permissions, staff, users, settings,
  audit logs). See `API_DOCUMENTATION.md` (✅ markers) and `/api/docs` locally.

## Mobile / Admin CMS / Website Changes
- None yet.

## Tests
- 75 passing locally (domain 19, contracts 5, api 51). CI run pending.

## Known Issues
- See `KNOWN_ISSUES.md` (KI-011…KI-017 added this phase).

## Blockers
- None.

## User Decisions Required
- None blocking. Later questions L1–L5 in `OPEN_QUESTIONS.md` when their phases start.

## Credentials Required
- None for Phase 5. Google OAuth client IDs needed by Phase 8; SMS provider when phone verification is enabled (L1).

## Launch configuration checklist (owner enters in CMS before go-live)
Taxonomy & courses · prices/sale prices/validity · plans & inclusions · coupons · VAT/PAN/invoice prefix · refund policy text ·
device limit (`auth.deviceLimit`, currently unlimited) · verification channels (`auth.verification`) · purchase channels per
platform · assessment rules · certificate rules · contact options · legal pages (reviewed drafts) · education level list ·
notification templates review.

## Local quick start
`pnpm install` → `pnpm infra:up` → copy `.env.example` to `.env` and fill secrets → `pnpm --filter @tk/api db:deploy` →
`pnpm build && pnpm test` → `pnpm --filter @tk/api dev` (API on :4000, docs at `/api/docs`) →
`pnpm --filter @tk/api cli create-super-admin --email you@example.com --name "Your Name"` (code arrives in Mailpit :8025).

## Exact Next Task
- After the Phase 4 PR is merged: branch `feature/admin-foundation` from `main` and start Phase 5 §5 (Admin CMS foundation).
