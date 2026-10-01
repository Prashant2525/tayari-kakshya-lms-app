# Changelog

All notable changes to this project. Format based on Keep a Changelog.

## [Unreleased]

### Added — 2026-10-02 (Phase 4: monorepo + backend foundation)
- pnpm 12 + Turborepo monorepo, shared TS/ESLint/Prettier config, GitHub Actions CI, UTF-8 README.
- Local infrastructure via Docker Compose: PostgreSQL 17 (+ test DB, citext, pg_trgm), Redis 7.4, Mailpit.
- `@tk/domain`: Bikram Sambat conversion/validation/formatting, Nepal fiscal year, Kathmandu day keys, integer-paisa
  money with VAT and discount math.
- `@tk/contracts`: error codes, localized text, auth and admin schemas, settings registry, permission catalog.
- `@tk/api` (NestJS 12 / Fastify / Prisma 7): first migration (identity, sessions, OTP, deletion, RBAC, settings, audit);
  student auth (email/password, Google, OTP verification, password reset, refresh rotation with reuse detection,
  sessions, device limit, self-service deletion); staff auth with HttpOnly cookie refresh; RBAC with escalation
  protection; Super Admin CLI; student administration; typed settings; audit log; maintenance mode; Redis rate limiting;
  health checks; OpenAPI; BullMQ worker (account erasure, auth cleanup).
- 75 automated tests (unit + integration against real PostgreSQL/Redis).

### Changed
- `.env.example` synced with the variables the API actually reads.
- `ARCHITECTURE.md` §4: admin CSRF defence uses a required custom header (T-018).

### Added — 2026-10-02 (Phase 2/3: decisions + architecture)
- Owner decisions recorded (`DECISIONS.md` D-001…D-042, T-001…T-015); follow-up clarifications in `OPEN_QUESTIONS.md`.
- `ARCHITECTURE.md`, `DATABASE_ARCHITECTURE.md`, `API_DOCUMENTATION.md`, `DESIGN_SYSTEM.md`.
- `FEATURE_SPECIFICATION.md` v1.0; `IMPLEMENTATION_PLAN.md` with all approved features sequenced.

### Changed
- `SUGGESTED_FEATURES.md` (all approved), `TECH_STACK_OPTIONS.md` (approved), environment docs, `CLAUDE.md` (stack, rules).

### Removed
- `Tayari Kakshya - LMS System.pdf` from version control (kept locally; still present in earlier history) — D-041.

### Added — 2026-10-02 (Phase 0/1: discovery)
- `CLAUDE.md` with permanent project rules, session-start procedure and git rules.
- `docs/PDF_UI_FEATURE_EXTRACTION.md` — page-by-page analysis of all 49 pages of the UI reference.
- `docs/FEATURE_SPECIFICATION.md` (draft v0.1), `docs/SUGGESTED_FEATURES.md`, `docs/TECH_STACK_OPTIONS.md`,
  `docs/OPEN_QUESTIONS.md`, `docs/ENVIRONMENT_REQUIREMENTS.md`.
- State documents: `PROJECT_STATE`, `IMPLEMENTATION_PLAN`, `DECISIONS`, `KNOWN_ISSUES`, `ENVIRONMENT_STATUS`,
  `TEST_STATUS`, `SESSION_HANDOFF`, `CHANGELOG`.
- `.env.example` (placeholders only) and `.gitignore` (secrets, keys, build output).
