# Production Readiness Audit — Phase 17

Date: 2026-10-13 · Code: `main` at `34e2223` (PR #54 merged) · Method: playbook §14.1 — the repository compared with
the approved scope (`FEATURE_SPECIFICATION.md`, `SUGGESTED_FEATURES.md`, `DECISIONS.md`), the UI reference
(`PDF_UI_FEATURE_EXTRACTION.md`), `IMPLEMENTATION_PLAN.md`, `DATABASE_ARCHITECTURE.md`, `API_DOCUMENTATION.md`, and
the security / payment requirements. Evidence = files, endpoints, screens and tests that exist **today**; Phase 15
(`SECURITY_REVIEW.md`) and Phase 16 (`TEST_STATUS.md` → "Phase 16") results are reused, not re-claimed.

**Verdict: NOT production-ready yet.** The application features are largely complete and tested, but the
deployment (Phase 18) does not exist, several owner-side setups are outstanding (production payment keys, email
provider, push credentials, store accounts, domain / VPS), and the audit found 13 gaps listed in
[§ Findings](#findings) for your approval. Nothing in the application was changed by this audit.

Status keys: **COMPLETE** (built, tested) · **PARTIAL** (built, part of the requirement missing) · **MISSING** (not
built) · **BROKEN** (built, does not work) · **BLOCKED** (waits on an owner decision / credentials / deployment).
No feature was found **BROKEN**.

---

## 1. Student app

### 1.1 Onboarding & accounts
| Feature | Status | Evidence |
|---|---|---|
| Splash / launch intro | COMPLETE | `features/launch/launch-intro.tsx` (D-069) |
| Language choice (en / ne) | PARTIAL | Follows the phone's language (`state/prefs.ts`, expo-localization) and switches in Profile (`mobile/e2e/app.spec.ts` "Nepali and dark theme"); **no explicit choice at first launch** (spec 2.1) — F-06 |
| Target exam / post selection (S1) | COMPLETE | `app/onboarding.tsx`, `PUT /me/target-posts`, `api/test/target-posts.e2e.test.ts` (6) |
| Sign up (name, email, password, terms) | COMPLETE | `app/(auth)/register.tsx`, `POST /auth/register`, `auth.e2e` (21), `mobile/e2e/app.spec.ts` |
| Google sign-in | PARTIAL / BLOCKED | Code complete (`features/auth/google-button.tsx`, `google-verifier.ts`, tested with a fake verifier); Android / iOS client ids not issued yet (KI-029) — owner |
| Email OTP verification | COMPLETE | `verification.e2e` (13), `app/verify.tsx`, Mailpit-backed browser test |
| Phone OTP verification | BLOCKED | `SMS_PROVIDER` only `disabled` / `log`; provider not chosen (L1) |
| Login, logout, forgot / reset by OTP, change password | COMPLETE | `auth.e2e`, `app.spec.ts` (reset by email code), `POST /me/password` |
| Devices list, sign out others | COMPLETE | `app/(learn)/profile/devices.tsx`, `GET/DELETE /me/sessions` |
| Device limit (D-028) | PARTIAL (config) | Enforced by the API when `auth.deviceLimit.maxActiveSessions` is set; **default is no limit** — owner must choose the number (launch checklist) |
| Account deletion with 7-day grace (D-032) | COMPLETE | `POST/DELETE /me/deletion`, `account-deletion.service.ts`, erasure coverage test (Phase 15) |

### 1.2 Home
| Feature | Status | Evidence |
|---|---|---|
| Greeting, BS date, avatar initials, bell with unread badge | COMPLETE | `app/(tabs)/index.tsx`, `GET /me/notifications/unread` |
| Unified search (S3) | COMPLETE | `app/(learn)/search.tsx`, `GET /search`, `practice.spec.ts` |
| Current-course switcher (D-011) | COMPLETE | `features/courses/current-course.tsx` (switch when several courses) |
| Continue learning | COMPLETE | `GET /me/continue`, `learning.spec.ts` |
| Daily challenge + streak (S9) | COMPLETE | `features/tests/daily-challenge-card.tsx`, `daily.spec.ts`, `engagement.e2e` |
| Live now / next live class | COMPLETE | `features/live/live-card.tsx`, `mobile/e2e/live.spec.ts` |
| Upcoming exams, latest notices, progress snapshot on Home | PARTIAL | Links to Tests and Progress; notices are in their own tab — Home shows **no upcoming-exam list or latest-notice strip** (spec 2.2) — F-07 |
| CMS banners / carousel | COMPLETE | `features/home/banner-carousel.tsx`, `banners.e2e`, `notices.spec.ts` (banner opens its article) |
| CMS-managed home sections (order / visibility) | MISSING | No model or endpoint; IMPLEMENTATION_PLAN §12 records "not built — ask the owner" — F-08 |
| Courses for my exam | COMPLETE | `CatalogList` on Home, `learning.spec.ts` |

### 1.3 Catalogue & course
| Feature | Status | Evidence |
|---|---|---|
| Category → post → courses, chips + search | COMPLETE | `app/(tabs)/courses.tsx`, `GET /exam-nodes`, `GET /courses?examNodeId&q` |
| Course card: artwork, price / sale (hidden on iOS), rating; owned → "You have access" | COMPLETE | `features/courses/course-card.tsx`, `ios-buyers.e2e` (6), `learning.spec.ts` |
| Course page: overview, subjects with marks / duration, instructors, counts, validity, reviews, CTA | COMPLETE | `app/(learn)/course/[slug].tsx`, `catalog.e2e` (16), `reviews.spec.ts` |
| Preview items on the course page | PARTIAL | Free items open from the outline; the course page has **no "preview" list** — minor, folded into F-07 |
| My courses | COMPLETE | `GET /me/courses`, Courses tab |

### 1.4 Learning
| Feature | Status | Evidence |
|---|---|---|
| Subject tabs Notes · Videos · Questions · Tests, chapter accordions | COMPLETE | `app/(learn)/subject/[courseId]/[subjectId].tsx`, Phase 16 screenshots |
| Rich-text notes (tables, images, A−/A+) | COMPLETE | `features/learn/rich-text.tsx` |
| PDF reader (self-hosted, watermarked, resume) | COMPLETE | `features/learn/pdf-reader.tsx`, `pdf-viewer/*`, `learning.spec.ts` |
| PDF page jump | MISSING | The reader resumes at the last page (`viewer-files.ts` `scrollIntoView`) but has **no "go to page"** (spec 2.4, p12) — F-09 |
| Watermarked PDF download | COMPLETE | `GET /learning-items/:id/pdf?download`, D-014 |
| Offline library — notes and PDFs | COMPLETE | `app/(learn)/downloads.tsx`, `offline.e2e`, T-069 / T-070 |
| Offline video (Bunny) | BLOCKED (on hold) | D-067 / D-073 — owner put it on hold |
| Video player (Bunny signed / YouTube nocookie), resume, completion, prev / next | COMPLETE | `features/learn/video-player.tsx`, `learning.spec.ts` (embed), progress tracking script; speed / quality / fullscreen come from the provider's player |
| Item states (done / in progress / locked / downloaded) | COMPLETE | outline item rows, `catalog.e2e` locking |
| Premium never sent to non-entitled students | COMPLETE | `catalog.e2e`, `practice.e2e`, Phase 16 exploratory (403, no body) |
| iOS: no prices / unlock CTA, neutral message (D-027) | COMPLETE (Android / browser verified) · iPhone not checked | `ios-buyers.e2e`; **no iPhone available** (KI-054) |
| Screen-capture protection (D-068) | COMPLETE (Android verified) | `lib/screen-protection.ts`; iPhone unverified (KI-054) |

### 1.5 Questions & practice
| Feature | Status | Evidence |
|---|---|---|
| Practice questions, all engine types, explanations, Check answer, premium answers locked | COMPLETE | `practice.e2e`, `practice.spec.ts`, domain scoring tests |
| Bookmarks (S5), report question, discussions per question / lesson (S12) | COMPLETE | `practice.spec.ts`, `discussions.e2e`, `discussions.spec.ts` |
| Previous-year questions: source / year shown, PYQ mock tests | COMPLETE | question source metadata (`question-card.tsx`), `pyq_mock` assessment type |
| PYQ **browsing by authority / post / paper / year** | MISSING | No student screen or endpoint to browse PYQs by those filters (spec 2.5, D-020) — F-10 |
| Mistake notebook + revision (S6) | COMPLETE | `mistakes.e2e` (5), `mistakes.spec.ts` |

### 1.6 Assessments
| Feature | Status | Evidence |
|---|---|---|
| Types quiz, subject test, weekly, mock, PYQ mock, daily challenge | COMPLETE | `AssessmentType` (contracts), `assessments.e2e`, `attempts.e2e` (14) |
| Exam mode: server-synced timer, palette, mark for review, autosave, resume, offline-tolerant answers | COMPLETE | `app/(learn)/exam/[attemptId].tsx`, `exam.spec.ts`, `reconnect.spec.ts` |
| Auto-submit at deadline, grace, windows, attempt limits, best / first counted | COMPLETE | `attempts.e2e`, D-048 |
| Result, breakdown, solutions, attempt history | COMPLETE | `result/[attemptId].tsx`, `review/[attemptId].tsx`, `attempts.tsx` |
| Release rules (immediate / after window / manual), leaderboard (S10) | COMPLETE | `grading.e2e`, `engagement.e2e`, `daily.spec.ts` |
| Subjective: self-evaluation / instructor grading | COMPLETE | `grading.e2e`, `admin/e2e/grading.spec.ts` |
| Certificates (S14), verifiable on the website | COMPLETE | `certificates.e2e`, `certificates.spec.ts`, website `/certificates/[code]` |
| Weekly-exam burst | COMPLETE (one process) / see F-11 | Phase 16 load test: 0 errors at 200 / 500; slow under a 200-at-once burst (KI-059) |

### 1.7 News & communication
| Feature | Status | Evidence |
|---|---|---|
| Current affairs digests, categories, linked quizzes | COMPLETE | `articles.e2e`, `notices.spec.ts` (weekly digest), website articles |
| Gorkhapatra summaries with source, blog | COMPLETE | article kinds `gorkhapatra`, `blog` |
| Notice tab: kinds, pinned, unseen badge, push / email | COMPLETE | `notices.e2e`, `notices.spec.ts` |
| Notices targetable by audience | PARTIAL (by decision) | Audience `all` only (D-060) |
| Notice attachments | PARTIAL | Rich text with images; **no file attachments** (e.g. the official PDF notice) — F-12 |
| Notifications: in-app, push, email, per-category preferences | COMPLETE | `event-notifications.e2e`, `notices.spec.ts`; push delivery needs FCM / APNs credentials (BLOCKED, owner) |

### 1.8 Commerce
| Feature | Status | Evidence |
|---|---|---|
| Plans screen, per-course purchase | COMPLETE | `plans.e2e`, `app/(learn)/plans.tsx` |
| Android checkout → coupon → eSewa / Khalti → return → **server verification** → result → receipt | COMPLETE (sandbox) | `payments.e2e` (8), `purchase.spec.ts` (6); verification in `PaymentsService.settle` (gateway status / lookup, exact amount, lock, idempotent) — **not fake** |
| iOS: no purchase UI; website purchases unlock | COMPLETE (iPhone unverified) | `ios-buyers.e2e`, website checkout |
| Website checkout | COMPLETE | `apps/web/src/app/checkout/*`, `web/e2e/website.spec.ts` |
| My purchases, receipts / invoices (VAT setting) | COMPLETE | `receipts-refunds.e2e`, `GET /orders/:id/receipt` |
| Plan status / expiry | COMPLETE | `plans.tsx` "mine until" |
| Refunds | COMPLETE | `receipts-refunds.e2e`, `admin/e2e/refunds.spec.ts` |
| Referrals / promo codes (S19), coupons | COMPLETE | `referrals.e2e`, `coupons.e2e`, `web/e2e/referral.spec.ts` |
| eSewa / Khalti **production** | BLOCKED | Configuration-only switch implemented; merchant production keys — owner |
| ConnectIPS | MISSING (on hold) | Not implemented (D-073); needs NCHL credentials |

### 1.9 Progress, profile, settings, support
| Feature | Status | Evidence |
|---|---|---|
| Progress per course / subject / topic, study time, accuracy, weak / strong topics (S8) | COMPLETE | `progress.e2e`, `progress-analytics.e2e`, `progress.spec.ts` |
| Study planner (S7) | COMPLETE | `planner.e2e`, `planner.spec.ts` |
| Edit profile: name, DOB (BS), gender, education level | COMPLETE | `app/(learn)/profile/edit.tsx`, `UpdateMeInput` |
| Change email (with re-verification), phone (+977) in profile | MISSING | `UpdateMeInput` has no email / phone; phone can be added only through verification when SMS exists — F-13 |
| Avatar picture | PARTIAL | Initials avatar only; no photo upload (spec 2.10, p24) — F-13 |
| Settings: language, theme (S18), notification preferences, downloads, devices, delete account | COMPLETE | Profile screens, `app.spec.ts` |
| About / Terms / Privacy / Refund pages, FAQ, contact options, app version | COMPLETE (drafts) | `support.e2e`, `help.spec.ts`; **legal texts are drafts awaiting owner approval (D-038)** |
| Force update / maintenance (S24) | COMPLETE | `GET /app/config`, `features/app-gate.tsx`, `lib/app-gate.ts` tests |

### 1.10 Advanced
| Feature | Status | Evidence |
|---|---|---|
| Live classes (S22) | COMPLETE | `live.e2e` (2), `admin/e2e/live.spec.ts`, `mobile/e2e/live.spec.ts` |
| AI study assistant (S13) | BLOCKED (on hold) | L2 / D-073 |

## 2. Admin CMS

| Module | Status | Evidence |
|---|---|---|
| Dashboard & analytics, reports, CSV exports | COMPLETE · see F-01 | `/`, `/reports`, `analytics.e2e`; the dashboard still shows a developer **"What's next (Phase 6 / 7 / 11)"** card — F-01 |
| Students (profile, devices, entitlements, attempts, grants, suspend) | COMPLETE | `/students`, `admin.e2e` (17) |
| Staff, roles & permissions, scopes, 2FA | COMPLETE | `/staff`, `/roles`, `mfa.e2e`, route-security test |
| Exam categories / category types / papers | COMPLETE | `taxonomy-types.e2e`, `content.spec.ts` |
| Courses (pricing, validity, instructors, subjects, certificate, notify students) | COMPLETE | `content-admin.e2e`, `notices.spec.ts` |
| Subjects / chapters / topics (reorder), notes, PDFs, videos | COMPLETE · see F-02 | `subject-page.tsx` reorder, `content.spec.ts`; Bunny videos are **linked by id** after uploading in Bunny's dashboard — no upload from the CMS (spec "Bunny upload") — F-02 |
| Media library | COMPLETE | `media.e2e` (7) |
| Question bank (types, versions, tags, PYQ metadata), import, reports | COMPLETE | `questions.e2e`, `question-import.e2e`, `questions.spec.ts` |
| Assessments builder (fixed / random sections = blueprints), grading queue, results | COMPLETE | `assessments.spec.ts`, `grading.spec.ts` |
| Leaderboards (staff view) | PARTIAL | Students see them; **no leaderboard view in the CMS** (results list only) — F-03 |
| Certificates (templates, rules, issued, revoke) | COMPLETE | `certificates.spec.ts` |
| Articles (current affairs / Gorkhapatra / news / blog), notices | COMPLETE | `notices.spec.ts` |
| Notification campaigns & templates | PARTIAL | Broadcasts via notices (push / email) and course updates; email texts editable in Settings; **no general campaign tool** — IMPLEMENTATION_PLAN "ask the owner" — F-08 |
| Banners | COMPLETE · home sections MISSING | `banners.e2e`; home sections — F-08 |
| Plans, coupons & sales, referrals, orders, payments reconciliation, refunds, invoices | COMPLETE | `plans.spec.ts`, `coupons.spec.ts`, `orders.spec.ts`, `refunds.spec.ts`, reconcile job + `POST /admin/payments/:id/check` |
| Reviews and discussions moderation | COMPLETE | `reviews.e2e`, `discussions.e2e` |
| FAQ, static pages, contact options, interested-on-iPhone | COMPLETE | `support.e2e`, `notices.spec.ts` |
| Live classes | COMPLETE | `admin/e2e/live.spec.ts` |
| App settings (verification, device limit, purchase channels, force update, maintenance, tax, invoices, …) | COMPLETE | `/settings`, `SETTINGS` registry |
| Audit log | COMPLETE | `/audit-log`, audit records on every staff write |
| Workflow draft → in_review → published (+ scheduled, archived) | COMPLETE | status workflow tests across content, questions, notices, articles |
| Preview as student + content QA checklist (S23) | MISSING | Approved (S23) but not built — F-04 |

## 3. Public website
| Feature | Status | Evidence |
|---|---|---|
| Home, courses, course pages, plans, articles, help, legal pages, certificate verification | COMPLETE | `apps/web/src/app/*`, `web/e2e` (10), sitemap crawl 14 / 14 (Phase 16) |
| Account, register, login, verify, reset | COMPLETE | `web/e2e/website.spec.ts` |
| Web checkout + payment result, referral links | COMPLETE | `website.spec.ts`, `referral.spec.ts` |
| Error monitoring / analytics on the website | MISSING (optional) | Not in scope as a must; noted in the deployment guide — F-05 |

## 4. Cross-cutting checks

| Area | Result | Evidence |
|---|---|---|
| Hard-coded production content | **One finding** (F-01: dashboard "What's next"). Prices, marks, validity, copy of courses all come from the CMS; scan of app / web / CMS code found no hard-coded prices or academic content | grep (Phase 17) |
| Mock APIs in production code | **None** — fakes exist only in tests (`test/fake-gateways.ts`, fake Google verifier) | grep |
| Fake payment verification | **None** — `settle` requires the gateway's own confirmation of the exact amount | `payments.e2e`, SECURITY_REVIEW |
| Security gaps | None open in the application (SECURITY_REVIEW F-1…F-7 fixed); remaining R-1…R-6 are build-tool advisories / deployment | `SECURITY_REVIEW.md` |
| Database | 34 migrations, FKs, CHECKs, indexes; financial / audit never deleted; erasure coverage test | `DATABASE_ARCHITECTURE.md`, Phase 15 |
| API | Validation (Zod) on every body; route access rules tested over all routes; CORS fixed (Phase 16) | route-security test |
| Mobile UX gaps | F-06 (first-launch language), F-07 (Home strips), F-09 (PDF page jump), F-13 (email / phone / photo) | above |
| Admin CMS gaps | F-01, F-02, F-03, F-04, F-08 | above |
| Performance | One API process: 200 simultaneous starts p50 ≈ 3 s; p95 < 300 ms for common reads **not measured on the VPS** — F-11 | TEST_STATUS Phase 16, KI-059 |
| Missing tests | iPhone (no device, KI-054); real push / Google / payments on devices (need credentials); the transaction-wait change is load-tested, not unit-tested | TEST_STATUS |
| Environment variables | All read variables documented and checked by `config-check`; app / CMS templates per folder | deployment guide §3, §10 |
| Deployment | **Not built** — Dockerfiles, production compose, reverse proxy, deploy workflow, backups, restore drill, uptime checks, staging (Phase 18) | guide §8 🏗️ |
| Accessibility | Contrast verified (39 token tests), labels, reduced motion; dynamic type and full screen-reader pass not audited on devices | `design-tokens` tests |
| Localization | en / ne everywhere, BS dates, NPR formatting; translations-complete test | `mobile` / `web` i18n tests |

## Findings

Severity: **H** blocks launch · **M** should be fixed before launch · **L** nice to have. "Needs decision" = a
product choice only you can make (rule 2: no invented business rules).

| # | Finding | Severity | Proposed action |
|---|---|---|---|
| F-01 | CMS dashboard shows a stale developer card "What's next (Phase 6 / 7 / 11)" | M | Remove it (or replace with real shortcuts) |
| F-02 | Bunny videos must be uploaded in Bunny's dashboard, then linked by id; spec says "Bunny upload" from the CMS | L | Add upload from the CMS (Bunny's upload API) — or accept the current workflow |
| F-03 | No leaderboard view for staff in the CMS | L | Add a leaderboard tab on assessment results |
| F-04 | S23 "preview as student" + content QA checklist not built | M | Build: open any lesson / test as a student would see it, plus a checklist before publishing |
| F-05 | No error monitoring on the public website | L | Add Sentry to the website (needs a DSN) |
| F-06 | No language choice at first launch (follows the phone; switch in Profile) | L — needs decision | Add a language step to onboarding, or accept |
| F-07 | Home lacks an upcoming-exams list, latest-notice strip and course-page preview list | L — needs decision | Add the strips, or accept the current Home |
| F-08 | CMS-managed home sections and general notification campaigns not built (plan: "ask the owner") | L — needs decision | Decide whether you want them |
| F-09 | PDF reader has no "go to page" | L | Add a page-number jump in the reader |
| F-10 | Previous-year questions cannot be browsed by authority / post / paper / year | M | Add a PYQ browser (filters on question source metadata) |
| F-11 | Capacity: one API process is slow under a 200-at-once burst; p95 on the VPS not measured | M | Phase 18: several API processes + load test on staging |
| F-12 | Notices cannot carry file attachments (e.g. the official PDF) | M | Allow PDF attachments on notices (media library) |
| F-13 | Students cannot change their email or phone, or upload a profile photo | M | Email change with re-verification; phone when SMS exists; optional photo upload |

**Blocked on you (not code):** production eSewa / Khalti keys; email provider + domain (L1); SMS provider (L1);
Google Android / iOS client ids; Firebase + APNs for push; Apple Developer / Google Play accounts; VPS, domain and
off-site backup location (L4); approval of the draft legal pages (D-038); device-limit number and other launch
checklist settings in the CMS; an iPhone check (KI-054).

**Next (Phase 18 — deployment):** Dockerfiles, production compose with the reverse proxy, deploy workflow, backups +
restore drill, uptime checks, staging environment, load test on staging, store builds.
