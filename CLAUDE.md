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
- Substantial work on `feature/*` branches (branching strategy pending owner confirmation — Q40).
- If push fails, commit locally and report exactly what is needed. Never claim a push that did not succeed.
- End-of-session report: Git branch / Latest commit / GitHub push status / Tests / Files changed / Current phase / Next task.

## Key documents
- `docs/PDF_UI_FEATURE_EXTRACTION.md` — page-by-page analysis of the UI reference PDF (49 pages)
- `docs/FEATURE_SPECIFICATION.md` — scope, tagged by origin [PDF]/[USER]/[REC]/[TECH]
- `docs/SUGGESTED_FEATURES.md` — optional features awaiting approval
- `docs/TECH_STACK_OPTIONS.md` — stack comparison (pending approval)
- `docs/OPEN_QUESTIONS.md` — owner decisions outstanding
- `docs/ENVIRONMENT_REQUIREMENTS.md`, `.env.example` — credentials inventory
- Reference inputs (repo root): `LokSewa_LMS_Production_Build_Playbook.pdf` (process), `Tayari Kakshya - LMS System.pdf` (UI)

## Stack
Not yet approved. See `docs/TECH_STACK_OPTIONS.md`. Fixed by owner: React Native, PostgreSQL.

## Environment notes
Windows 11; PowerShell + Git Bash. Node 24, npm 11. No Docker / PostgreSQL / pnpm installed yet (see `docs/ENVIRONMENT_STATUS.md`).
