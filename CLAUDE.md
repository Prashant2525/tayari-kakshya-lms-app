# CLAUDE.md — Tayari Kakshya LMS

This repository is the source of truth for a **production** Lok Sewa / competitive-exam preparation LMS:
React Native student app + web Admin CMS + backend API + PostgreSQL. It is a real product, not a demo.

## Start of every session (mandatory)

1. Read `docs/PROJECT_STATE.md`, `docs/SESSION_HANDOFF.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/DECISIONS.md`,
   `docs/KNOWN_ISSUES.md`, `docs/TEST_STATUS.md`, `docs/ENVIRONMENT_STATUS.md`.
2. Run `git status`, `git log --oneline -15`, `git branch -a`; inspect the actual code and tests.
3. Reconcile docs with the code. **The repository is the memory — never trust conversation history.**
4. State CURRENT PHASE / TASK / ACTUALLY COMPLETED / IN PROGRESS / REMAINING / NEXT before changing code.

## Permanent rules

1. Never fabricate secrets or production credentials. Sandbox/test only until the owner provides production values.
2. Never silently invent product/business rules (prices, validity, marks, negative marking, refunds, legal text).
   Unanswered → ask, and record in `docs/OPEN_QUESTIONS.md`. Answered → record in `docs/DECISIONS.md`.
3. PostgreSQL is the canonical database. Use migrations, FKs, constraints, indexes. No permanent mock APIs.
4. Keep `apps/mobile`, `apps/admin`, `apps/api` concerns separate; share only via `packages/*`.
5. Authorization is enforced on the server. Mobile/admin checks are UX only. Premium content is never sent to
   non-entitled clients (no "blur on the client" security).
6. Never trust client-side prices or payment success. Verify with the provider server-side; idempotent callbacks;
   bind amount + order + user; audit every financial state change.
7. No hard-coded academic or commercial content in the apps — everything comes from the CMS/DB.
8. Financial and audit records are never hard-deleted.
9. Do not call a feature complete without running its tests and verifying behaviour; report evidence.
10. Update `PROJECT_STATE.md`, `SESSION_HANDOFF.md`, `IMPLEMENTATION_PLAN.md` (+ `TEST_STATUS.md`, `CHANGELOG.md`,
    `KNOWN_ISSUES.md` when relevant) after meaningful work and before a session is likely to end.
11. Follow approved decisions in `DECISIONS.md`; only implement features approved in `SUGGESTED_FEATURES.md`.

## Git / GitHub rules

- Remote: `origin` → github.com/Prashant2525/tayari-kakshya-lms-app. Default branch `main`.
- Never force-push, never rewrite remote history, never reset shared branches, never commit `.env`/keys/certs.
- Before every commit/push: check branch, remote, `git status`, staged files, diff; scan for secrets; run relevant checks.
- Conventional commits (`feat(auth): …`, `fix(exams): …`, `docs: …`, `test(…)`, `refactor(…)`).
- Work on `feature/*` (or `docs/*`, `fix/*`) branches; push and open a PR into `main` (D-006). Never commit directly to `main`.
- If push fails, commit locally and report exactly what is needed. Never claim a push that did not succeed.
- End-of-session report: Git branch / Latest commit / GitHub push status / Tests / Files changed / Current phase / Next task.

## Key documents

- `docs/PDF_UI_FEATURE_EXTRACTION.md` — page-by-page analysis of the UI reference PDF (49 pages)
- `docs/FEATURE_SPECIFICATION.md` — approved scope v1.0
- `docs/SUGGESTED_FEATURES.md` — S1–S24, all approved
- `docs/TECH_STACK_OPTIONS.md` — stack comparison (approved)
- `docs/OPEN_QUESTIONS.md` — owner answers + later questions (L1–L5)
- `docs/DECISIONS.md` — every confirmed decision (read before implementing anything)
- `docs/ENVIRONMENT_REQUIREMENTS.md`, `.env.example` — credentials inventory
- Reference inputs: `LokSewa_LMS_Production_Build_Playbook.pdf` (process, tracked). The UI PDF `Tayari Kakshya - LMS System.pdf`
  is **local-only / untracked** (D-041) — use `docs/PDF_UI_FEATURE_EXTRACTION.md` as the in-repo reference.

## Stack (approved — `docs/DECISIONS.md` T-001…T-015)

pnpm + Turborepo monorepo: `apps/api` (NestJS/Fastify + Prisma + PostgreSQL 17 + Redis/BullMQ), `apps/admin` (React + Vite +
TanStack + shadcn/ui), `apps/mobile` (Expo + Expo Router), `apps/web` (Next.js 16, built — T-053), `packages/*` (contracts, domain,
design-tokens, i18n, config). Storage Cloudflare R2; video Bunny Stream + YouTube unlisted; push Expo; Sentry + PostHog.
Hosting: Nepal VPS with Docker Compose. Architecture: `docs/ARCHITECTURE.md`, `docs/DATABASE_ARCHITECTURE.md`,
`docs/API_DOCUMENTATION.md`, `docs/DESIGN_SYSTEM.md`.

## Product rules that are easy to get wrong

- Business values are CMS data ("manage from admin portal") — never constants in code.
- iOS app shows **no prices, purchase buttons or external purchase links** when the iOS channel is web-only (D-027).
- Bilingual en/ne everywhere; dates displayed in Bikram Sambat (D-008, D-009).
- Premium answers/bodies/URLs are never sent to non-entitled clients.

## Environment notes

Windows 11; PowerShell + Git Bash. Node 24, pnpm 12.8.1, Docker Desktop (WSL2). See `docs/ENVIRONMENT_STATUS.md`.

- Start infra: `pnpm infra:up` (Postgres :5432 with `tayari_kakshya` + `tayari_kakshya_test`, Redis :6379, Mailpit UI :8025).
- Verify everything: `pnpm format:check && pnpm build && pnpm lint && pnpm typecheck && pnpm test`.
- API: `pnpm --filter @tk/api dev` (needs root `.env`); migrations: `pnpm --filter @tk/api exec prisma migrate dev --name <x>`.
- Admin CMS: `pnpm --filter @tk/admin dev` (:5173, proxies `/api` → :4000). Browser E2E: `pnpm build && pnpm --filter @tk/admin e2e`.
- Website: `pnpm --filter @tk/web dev` (:3000, reads the root `.env`; talks to the API from its server only). Browser
  E2E: `pnpm build && pnpm --filter @tk/web e2e` (`next start` + API on `*_web_e2e`, Mailpit, gateway stand-in).
- Student app: `pnpm --filter @tk/mobile dev` (Expo; `w` = web); Android emulator: `pnpm --filter @tk/mobile android`
  (needs `ANDROID_HOME`; see SESSION_HANDOFF). Browser E2E (web build, phone viewport, Mailpit for
  codes): `pnpm build && pnpm --filter @tk/mobile e2e`. Pin Expo packages to the versions in Expo's bundledNativeModules.
- After UI changes, verify in a real browser (Playwright) — screenshots caught defects that tests missed.
- TypeScript is pinned to 6.0 (T-016). Do not add SWC or other unsigned native binaries without checking they load on
  this machine — Windows Smart App Control blocks them (KI-011).
- Business values are never hard-coded: new configurable rules go into the `SETTINGS` registry in `packages/contracts`.
