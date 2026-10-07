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
| 5 | Admin CMS foundation | see §5 | ☑ merged |
| 6 | Academic/content CMS | see §6 | ☑ merged |
| 7 | Question bank + assessment CMS | see §7 | ☑ merged |
| 8 | Student mobile foundation | see §8 (includes design preview gate) | ☑ merged |
| 9 | Student learning | see §9 | ☑ merged |
| 10 | Exam engine + engagement | see §10 | ☑ |
| 11 | Commerce + website checkout | see §11 | ☑ (part 4b in PR) |
| 12 | Communication & CMS content | see §12 | ☑ |
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

**§6 Academic/content CMS** (branch `feature/content-cms`) — ☑ DONE (PR open; Bunny token auth pending, KI-023)
- ☑ Object storage (SeaweedFS local/CI, R2 prod — T-020) + media library with validated uploads (T-025)
- ☑ Migration `content_catalog` (taxonomy, papers, subjects/chapters/topics, learning items, videos, courses,
  instructors, entitlements)
- ☑ Admin API: taxonomy + papers, content tree with reorder/soft delete/restore, publish/schedule workflow (D-036,
  T-026), courses (details, pricing, subjects, exam links, instructors, publishing), instructor profiles, staff scopes,
  admin access grants (until payments)
- ☑ Student API: catalog (platform-aware prices, D-027), my courses, outline, items with server-side locking,
  watermarked PDF (T-029), video playback (YouTube nocookie, signed Bunny — awaiting credentials)
- ☑ Admin screens: media library + media picker, exam categories tree, papers (+ Playwright E2E, content-team account)
- ☑ Admin screens: subjects → chapters → topics → items with TipTap note editor (en/ne), PDF and video items,
  publishing/scheduling (+ E2E)
- ☑ Admin screens: courses (details, pricing, subjects, links, publishing), instructor profiles, staff scopes,
  student access grants (+ E2E)
- ↪ Moved: preview-as-student → §9 (reuses the student app's renderers); command palette + generic data table →
  admin polish (KI-024)

Original scope: exam taxonomy tree (drag/move), papers, subjects/chapters/topics (reorder/duplicate),
courses (pricing fields, validity, instructors, subjects, exam links), instructor profiles, learning items (TipTap notes,
PDFs, videos via Bunny upload or YouTube link), media library, publish/schedule/soft delete, preview-as-student;
student read APIs for all of the above with access checks. Tests: CRUD, publish rules, access control.

**§7 Question bank + assessment CMS** (branch `feature/question-bank`) — ◐ IN PROGRESS
- ☑ Scoring engine (`@tk/domain`), question schemas (`@tk/contracts`), migration `question_bank`, admin question API,
  passages, tags, PYQ sources, reports (+ tests)
- ☑ Admin screens: question bank list/editor (all types), passages, reports queue (+ E2E)
- ☑ Dynamic admin audit (`DYNAMIC_ADMIN_AUDIT.md`): admin-managed category types (incl. sub-group, exam stage),
  question types switch, import template `tk-questions-v1` + row parser
- ☑ XLSX import: upload → validation preview (row/column problems, name resolution) → confirm → drafts (+ E2E)
- ☑ Assessments: schema, builder (sections, fixed/random pools, rules per D-021/D-044), readiness, admin screens (+ E2E)
- ☐ Grading queue and results release (with the attempt engine, §10)

Original scope: all question type engines + versioning, PYQ metadata, tags, CSV/XLSX import with
validation preview, reports queue, assessment builder (all types, blueprints, rules), grading queue, results release.
Tests: scoring per type, negative marking, blueprint generation.

**§8 Student mobile foundation** (branch `feature/mobile-foundation`) — ◐ IN PROGRESS
- ☑ Design preview published and **approved** (D-047)
- ☑ Expo SDK 57 app, Expo Router (auth / verify / onboarding / tabs), route guards (T-037)
- ☑ Theme from `@tk/design-tokens` (light/dark/auto), Mukta, i18n en/ne + toggle, BS dates, Devanagari digits
- ☑ Components (Text, Button, TextField, OTP input, Segmented, Checkbox, Card, Banner, Skeleton, Empty/Error/Loading/Offline states)
- ☑ API client (single-flight refresh, typed errors), secure token storage, install id for the device limit
- ☑ Auth: sign up, login (device-limit choice), forgot/reset by code, email/SMS verification; Google button (KI-029)
- ☑ `/app/config`: maintenance + force update with CMS store links; onboarding target post (API `/me/target-posts`)
- ☑ Tests: unit (21) + browser E2E against the real API (4) + screenshots light/dark/Nepali/tablet
- ☑ Monitoring (T-042): Sentry in the API + worker, admin CMS and app · PostHog in the app (pseudonymous, no personal
  data) — source-map upload with the first EAS build · ◐ run on a phone/emulator (KI-031)

**§9 Student learning** (branches `feature/student-learning`, `feature/student-learning-2`) — ☑ DONE (on merge)
- ☑ Part 1: catalog for the student's exam + search, course detail (Enrol, prices / iOS rule), my courses with progress,
  Home current course + switcher + Continue, subject outline with states, note reader (rich text, A−/A+, language),
  PDF reader (self-hosted pdf.js, watermark, T-038), video (signed Bunny / YouTube embed) with progress (T-039),
  locked and verify-first states — API `learning_progress`, `/me/continue`, `/viewer/pdf`
- ☑ Part 2 (branch `feature/student-learning-2`): practice questions on the subject screen (all 7 types, Check
  answer, explanation / model answer, locked Premium answers never sent — T-041), report a question, bookmarks
  (lessons + questions) and Saved, unified search (courses, lessons, questions), profile: edit (BS date of birth,
  gender, education level), change / set password, signed-in devices, delete account (request + keep) — API
  migration `bookmarks`, `/courses/:c/subjects/:s/questions`, `/practice-questions/:id`, `/me/bookmarks`, `/search`
- Home CMS sections / banners are §12 (DYNAMIC_ADMIN_AUDIT §2.3); PDF download to the device is §14 (offline).

**§10 Exam engine + engagement** (branch `feature/exam-engine`) — ☑ DONE
- ☑ Part 1: attempt engine (T-043, D-048) — student tests list (course / subject / my exams), test page with the CMS
  rules, start/resume, autosave + offline copy, server deadline + grace + automatic submit (worker), scoring with the
  assessment's rules, results per release rule, solutions, self-graded written answers, attempt history; exam mode
  (timer, palette, mark for review, confirm submit), result (score ring, sections), review; CMS: premium access, late
  start and official attempt per assessment + Settings → Assessment defaults and Exam timing
- ☑ Part 2 (branch `feature/grading`, T-044): Grading queue for written answers (marks + comment, corrections),
  results per assessment (statistics from official attempts, attempts, one attempt in full), manual release;
  students see the teacher's comment. Also fixed a staff-scope bypass in the CMS assessment search (KI-035)
- ☑ Part 3a (branch `feature/daily-challenge`, D-049, T-045): daily challenge on Home with streak, past challenges as
  practice, ranks on results and leaderboards (names per CMS setting), exam header answered/marked counter;
  CMS settings Leaderboards + Daily challenge; fixed the onboarding guard race (KI-037)
- ☑ Part 3b (branch `feature/certificates`, D-050, T-046): certificates for finishing a course — CMS templates
  (wording, signatories, share of lessons, preview), course Certificate tab, automatic issue, Profile → Certificates,
  course-page progress, "certificate earned" dialog, PDF (Nepali shaping, BS date, QR), public verification,
  revoke / reinstate (audited), Settings → Certificate verification
- ☑ Part 3c (branch `feature/mistake-notebook`, D-050, T-047): mistake notebook & revision mode — practice
  answers recorded and scored on the server, test mistakes after release, Profile → Mistake notebook (subject filter,
  revision cards, self-review for written answers, remove), "Revise your mistakes" on results, Settings → Mistake
  notebook (N)
- ☑ Hardening (branch `feature/exam-hardening`, T-048): late saves never overwrite newer answers (`clientSavedAt`),
  concurrent submits, a save racing a submit, submit after the deadline; offline answers survive closing the app
  (KI-039 fixed); browser test for reconnecting

Original plan: assessments list, exam mode (timer, palette, autosave queue, resume, submit,
auto-submit), results & solutions, attempt history, subjective self-grading, daily challenge + streaks, leaderboards,
certificates (issue + verify), mistake notebook & revision mode. Edge-case tests (reconnect, double submit, expiry, duplicate start).

**§11 Commerce** — ☑ COMPLETE (parts 1–4b)
- ☑ Part 1 (T-049, D-051, D-052): course purchase — orders at the server's price, eSewa + Khalti (test credentials,
  everything from `.env`), server-side verification, idempotent settlement, duplicate / amount checks, reconciliation
  worker, access with the bought validity; app: Buy → checkout → gateway → result, Profile → Purchases; CMS: Orders
  (payments, gateway messages, check again), Settings → Payment methods
- ☑ Part 2a (T-050, D-054): plans — CMS (Sales → Plans), `GET /plans`, plan checkout and renewal, access follows the
  plan's current courses; app "Choose your plan" (Profile → Subscription plan)
- ☑ Part 2b (T-051, D-055, D-056): coupons (CMS, checkout, share links, limits, Rs 0 orders) and VAT settings in the
  CMS (`commerce.tax`) with a VAT snapshot on each order
- ☑ Part 3 (T-052, D-057): numbered receipts (PDF in the app and by email), refund workflow with approval
- ☑ Part 4a (T-053): public website (Next.js) — catalog, plans, checkout with coupons, sign-in, receipts, certificate check
- ☑ Part 4b (T-054, D-058, D-059): referral programme — personal codes / links, friend's first-purchase discount
  (bigger of it and a coupon), owner-only reward coupon, cancelled on a full refund when unused
- Later (release phase / §12): legal pages on the website, app links for share links (KI-044, KI-046), ConnectIPS (§14)

Original plan: plans, course purchase, coupons/sales, orders, eSewa + Khalti providers (sandbox), callbacks,
verification, reconciliation worker, entitlements, VAT/invoice numbering + PDF, refunds workflow, referral program,
iOS web-only channel rules, **Next.js website** (course pages, auth, checkout, receipts, legal pages, certificate verify).
Payment edge-case tests per Playbook §11.11.

**§12 Communication** — articles (current affairs, Gorkhapatra summaries, news, blog) with BS dates and quizzes, notices
(official/announcement/instructor, audiences), notification pipeline (in-app, Expo push, email), preferences, campaigns,
banners & home sections, FAQs, contact options, static pages with **draft legal texts (D-038) for owner review**.
- ☑ Part 12a (T-055, D-060): notices (CMS, Notice tab with badge, pinned / expiring, optional push + email) and the
  notification pipeline — in-app list, outbox with retries, Expo push, email, preferences per category
- ☑ Part 12b (T-056): event notifications — purchase (in-app + push; the receipt is the email), results once out
  (unless already opened), exam reminders (CMS times, default 1 day / 1 hour), "Notify students" on the course page
- ☑ Part 12c-1 (T-060, D-063): articles — CMS, public API, app (Home tiles, lists, article page, quiz link), push /
  email per article
- ☑ Part 12c-2 (T-061): articles on the website (list, pages, home section, SEO metadata, JSON-LD, sitemap) and in
  unified search (app)
- ☑ Part 12d-1 (T-062, D-064): static pages (DRAFT legal texts with versions, D-038), FAQs, contact options — CMS,
  app (Profile → Help & support, pages) and website (/help, legal pages, footer, sign-up links)
- ☑ Part 12d-2 (T-063): banners on the app Home and the website home page (D-064)
- Not built (not requested): general notification campaigns (notices with push / email and course updates cover
  broadcasts) and configurable home sections (Home order is fixed). Ask the owner if wanted.

**§13 Progress & community** — progress analytics (accuracy, weak/strong topics, study time), study planner,
course reviews + moderation, discussions/doubts + moderation, admin dashboards & exports.

**§14 Advanced** — offline downloads (PDF + Bunny video, license refresh), screen-capture protection, ConnectIPS provider,
AI study assistant (after L2), live classes (after L3), Apple IAP (only if decided later).

## Next concrete steps
1. Owner reviews and merges the `feature/admin-foundation` PR; confirm both CI jobs (`verify`, `admin-e2e`) are green.
2. Start §6 Academic/content CMS on `feature/content-cms` (taxonomy, papers, courses, subjects/chapters/topics, notes,
   PDFs, videos, media library + local S3-compatible storage choice — T-020).
