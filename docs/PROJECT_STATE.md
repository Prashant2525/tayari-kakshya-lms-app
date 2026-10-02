# Project State

Current Phase: **Phase 5 — Admin CMS foundation: COMPLETE (verified locally, incl. browser E2E)**
Current Milestone: PR review for `feature/admin-foundation` → Phase 6 Academic/content CMS
Overall Status: **IN PROGRESS**
Last updated: 2026-10-02

## Completed
- Phases 0–3: discovery, PDF extraction, decisions, approved architecture.
- Phase 4 (merged, PR #3): monorepo, local infra, domain/contracts packages, API foundation (auth, RBAC, settings,
  audit, worker, CLI), CI.
- Phase 5 (branch `feature/admin-foundation`):
  - API: staff two-factor (TOTP + recovery codes, encrypted secrets, replay protection, policy `auth.staffMfa`),
    education levels, dashboard counts, audit actor enrichment, e2e seed script.
  - `@tk/design-tokens` package (WCAG-tested light/dark tokens, generated CSS variables).
  - `@tk/domain` BS date module made browser-compatible.
  - `apps/admin` Admin CMS (see IMPLEMENTATION_PLAN §5), verified by a browser walkthrough and Playwright E2E.
  - 145 unit/integration tests + 3 browser E2E tests passing.

## In Progress
- Owner review of the Phase 5 PR; first run of the new CI job `admin-e2e`.

## Remaining
- Phases 6–18 (`IMPLEMENTATION_PLAN.md`).

## Database Changes (Phase 5)
- Migration `staff_mfa`: `users.mfa_secret_enc`, `users.mfa_enabled_at`, `users.mfa_last_used_step`; table `mfa_recovery_codes`.

## API Changes (Phase 5)
- `POST /admin/auth/login/mfa`, `/admin/me/mfa*`, `/admin/dashboard`, `/education-levels`, `/admin/education-levels*`;
  `/me` adds `mfaEnabled`, `mfaSetupRequired`, `isSuperAdmin`; staff list adds `mfaEnabled`; audit entries add `actor`.
- New permission `education_levels:manage`; new setting `auth.staffMfa` (default: required for Super Admins).

## Admin CMS
- `apps/admin` — run `pnpm --filter @tk/admin dev` (http://localhost:5173, proxies `/api` to the API on :4000).

## Mobile / Website
- Not started (Phase 8 / Phase 11).

## Tests
- Unit/integration 145 · browser E2E 3 — all passing locally (see `TEST_STATUS.md`).

## Known Issues
- See `KNOWN_ISSUES.md` (KI-014, KI-016, KI-017 resolved; KI-018…KI-020 added).

## Blockers
- None.

## User Decisions Required
- None blocking. Later questions L1–L5 in `OPEN_QUESTIONS.md`.

## Credentials Required
- None for Phase 6 locally. Bunny Stream / Cloudflare R2 accounts will be needed when media upload goes beyond local
  development (Phase 6 end).

## Launch configuration checklist (owner enters in CMS before go-live)
Taxonomy & courses · prices/sale prices/validity · plans & inclusions · coupons · VAT/PAN/invoice prefix · refund policy text ·
device limit · verification channels · staff 2FA policy · purchase channels per platform · assessment rules · certificate rules ·
contact options · legal pages (reviewed drafts) · education level list · notification templates review.

## Local quick start
`pnpm install` → `pnpm infra:up` → `.env` from `.env.example` (generate secrets incl. `ENCRYPTION_KEY`) →
`pnpm build` → `pnpm --filter @tk/api db:deploy` → `pnpm --filter @tk/api dev` and `pnpm --filter @tk/admin dev` →
create your Super Admin: `pnpm --filter @tk/api cli create-super-admin --email you@example.com --name "Your Name"`
(code in Mailpit http://localhost:8025) → set password at http://localhost:5173/set-password → sign in → enrol 2FA.

## Exact Next Task
- After the Phase 5 PR is merged: branch `feature/content-cms` from `main` and start Phase 6.
