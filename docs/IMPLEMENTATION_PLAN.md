# Implementation Plan

Status keys: ☐ not started · ◐ in progress · ☑ done (verified) · ⛔ blocked · 👀 awaiting owner review.
Scope = approved decisions only (`DECISIONS.md`). Each phase ends with tests, doc updates, a commit and a PR into `main`.

| Phase | Name | Outcome | Status |
|---|---|---|---|
| 0 | Requirements discovery | Owner questions asked and answered | ☑ |
| 1 | PDF extraction | `PDF_UI_FEATURE_EXTRACTION.md` (49/49 pages) | ☑ |
| 2 | Features + stack selection | All suggestions approved; stack approved (T-001…T-015) | ☑ |
| 3 | Architecture | `ARCHITECTURE.md`, `DATABASE_ARCHITECTURE.md`, `API_DOCUMENTATION.md`, `DESIGN_SYSTEM.md` | ☑ approved by owner |
| 4 | Monorepo + backend foundation | see §4 | ☑ merged (PR #3), CI green |
| 5 | Admin CMS foundation | see §5 | ☑ verified (148 tests incl. browser E2E); 👀 PR review |
| 6 | Academic/content CMS | see §6 | ☐ |
| 7 | Question bank + assessment CMS | see §7 | ☐ |
| 8 | Student mobile foundation | see §8 (includes design preview gate) | ☐ |
| 9 | Student learning | see §9 | ☐ |
| 10 | Exam engine + engagement | see §10 | ☐ |
| 11 | Commerce + website checkout | see §11 | ☐ |
| 12 | Communication & CMS content | see §12 | ☐ |
| 13 | Progress & community | see §13 | ☐ |
| 14 | Advanced approved features | see §14 | ☐ |
| 15 | Security hardening | authn/authz/IDOR/uploads/payments/rate limits/secrets review | ☐ |
| 16 | Full testing + bug fixing | systematic pass; load test weekly-exam burst | ☐ |
| 17 | Production audit | `PRODUCTION_READINESS_AUDIT.md` | ☐ |
| 18 | Release | VPS deployment, monitoring, backups, store submissions, `RELEASE_READINESS.md` | ☐ |

## Phase details

**§4 Monorepo + backend foundation** (branch `feature/foundation`) — ☑ DONE
- ☑ pnpm + Turborepo workspace; `packages/config`, `contracts`, `domain` (BS dates + money, tested)
- ☑ Docker Compose dev (Postgres 17 + test DB, Redis 7.4, Mailpit) — MinIO dropped (T-020)
- ☑ NestJS 12 (Fastify, ESM) with env validation, Prisma 7 + first migration (identity, sessions, OTP, deletion,
  education levels, RBAC, settings, audit), Zod validation, error format, Pino logging, request ids, Redis rate limiting,
  helmet/CORS/cookies, health checks, OpenAPI (`/api/docs`, non-production)
- ☑ Auth: register, login, Google, refresh rotation + reuse detection, logout, sessions, device limit (+ replace session),
  email/phone OTP verification (channel toggles), password reset by OTP, change password, self-service deletion + erasure job
- ☑ Staff auth (cookie refresh, `X-TK-Client` CSRF header), RBAC guard, permission catalog, roles/staff management with
  escalation protection, Super Admin CLI, student administration, typed settings registry, audit log, maintenance mode
- ☑ Worker process (BullMQ schedulers: account erasure, auth cleanup)
- ☑ CI workflow (GitHub Actions) — first run pending (KI-017)
- ↪ Moved: presigned uploads → §6 (media library); `design-tokens` skeleton → §8

**§5 Admin CMS foundation** (branch `feature/admin-foundation`) — ☑ DONE
- ☑ API: staff TOTP 2FA + recovery codes + policy (T-022), education levels, dashboard counts, audit actor names
- ☑ `@tk/design-tokens` (light/dark, WCAG-tested) consumed by the CMS via Tailwind 4
- ☑ `apps/admin`: React 19 + Vite 8 + TanStack Router/Query + RHF/Zod + Radix; sign-in with 2FA step, forgot/set password,
  forced 2FA enrolment with QR + recovery codes, permission-aware navigation, dashboard, students (search, filter,
  cursor pagination, detail, sessions, suspend/reactivate, revoke, device-limit override), staff (invite, roles,
  suspend), roles & permission editor (cannot grant what you lack), education levels (bilingual, reorder), typed system
  settings, audit log, account (profile, password, 2FA), light/dark/system theme, responsive layout, BS dates
- ☑ Tests: admin unit (Vitest) + Playwright E2E (CI job `admin-e2e`)
- ↪ Deferred: command palette (⌘K) and generic data-table framework → built with the first content module in Phase 6

Original scope: Vite app, staff auth (cookie refresh, `X-TK-Client` header, TOTP 2FA — KI-014), education level
CRUD (KI-016), layout/nav, command palette,
generic resource table (server pagination/filter/sort), form system (RHF + Zod), status workflow UI, media picker,
roles & staff management, settings screens, audit log viewer. Playwright smoke tests.

**§6 Academic/content CMS** — exam taxonomy tree (drag/move), papers, subjects/chapters/topics (reorder/duplicate),
courses (pricing fields, validity, instructors, subjects, exam links), instructor profiles, learning items (TipTap notes,
PDFs, videos via Bunny upload or YouTube link), media library, publish/schedule/soft delete, preview-as-student;
student read APIs for all of the above with access checks. Tests: CRUD, publish rules, access control.

**§7 Question bank + assessment CMS** — all question type engines + versioning, PYQ metadata, tags, CSV/XLSX import with
validation preview, reports queue, assessment builder (all types, blueprints, rules), grading queue, results release.
Tests: scoring per type, negative marking, blueprint generation.

**§8 Student mobile foundation** — **design preview published for owner sign-off first**; Expo app, Expo Router structure,
tokens/theme (light/dark), Mukta font, i18n (en/ne) + toggle, BS dates, components library, API client, auth flows
(sign up/login/Google/OTP/reset), secure storage, error/empty/loading/offline states, `/app/config` (force update,
maintenance), Sentry, PostHog, onboarding target-post selection.

**§9 Student learning** — Home (CMS sections, course switcher), categories/posts, course list & detail, my courses,
subject outline, notes reader, PDF viewer + watermarked download, video player (Bunny/YouTube) with progress, practice
questions & model answers, bookmarks, report question, unified search, locked states, profile & edit profile, settings.

**§10 Exam engine + engagement** — assessments list, exam mode (timer, palette, autosave queue, resume, submit,
auto-submit), results & solutions, attempt history, subjective self-grading, daily challenge + streaks, leaderboards,
certificates (issue + verify), mistake notebook & revision mode. Edge-case tests (reconnect, double submit, expiry, duplicate start).

**§11 Commerce** — plans, course purchase, coupons/sales, orders, eSewa + Khalti providers (sandbox), callbacks,
verification, reconciliation worker, entitlements, VAT/invoice numbering + PDF, refunds workflow, referral program,
iOS web-only channel rules, **Next.js website** (course pages, auth, checkout, receipts, legal pages, certificate verify).
Payment edge-case tests per Playbook §11.11.

**§12 Communication** — articles (current affairs, Gorkhapatra summaries, news, blog) with BS dates and quizzes, notices
(official/announcement/instructor, audiences), notification pipeline (in-app, Expo push, email), preferences, campaigns,
banners & home sections, FAQs, contact options, static pages with **draft legal texts (D-038) for owner review**.

**§13 Progress & community** — progress analytics (accuracy, weak/strong topics, study time), study planner,
course reviews + moderation, discussions/doubts + moderation, admin dashboards & exports.

**§14 Advanced** — offline downloads (PDF + Bunny video, license refresh), screen-capture protection, ConnectIPS provider,
AI study assistant (after L2), live classes (after L3), Apple IAP (only if decided later).

## Next concrete steps
1. Owner reviews and merges the `feature/admin-foundation` PR; confirm both CI jobs (`verify`, `admin-e2e`) are green.
2. Start §6 Academic/content CMS on `feature/content-cms` (taxonomy, papers, courses, subjects/chapters/topics, notes,
   PDFs, videos, media library + local S3-compatible storage choice — T-020).
