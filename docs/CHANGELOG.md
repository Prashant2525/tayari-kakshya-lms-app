# Changelog

All notable changes to this project. Format based on Keep a Changelog.

## [Unreleased]

### Fixed — 2026-10-08
- App in development on a real phone (Expo Go / dev build): pictures (courses, banners, articles) did not load because
  the local API gives `http://localhost:4000/...` addresses; the app now points them at the computer it already
  reaches. Release builds are unaffected (public media domain).
- App on Android in Expo Go: "Required property 'android.package' is not found" — since `expo-dev-client` was added
  (T-057) `expo start` targets a development build, which needs the app identifiers (L5). `dev`, `android` and `ios`
  now open Expo Go (`--go`); `dev:client` is for development builds. Then a black screen: importing
  `expo-notifications` throws in Expo Go on Android (SDK 53+); it is now loaded only where push works.

### Added — 2026-10-08 (Phase 12d part 2: banners)
- CMS: Communication → Banners — picture, title, link (course, plan, article, page or web address), app / website /
  both, start and end, order; plan and web links (and banners marked so) are not shown on iPhone.
- App: banners swipe at the top of Home. Website: a row of banners on the home page.

### Added — 2026-10-07 (Phase 12d part 1: pages and Help & support)
- CMS: Communication → Pages (About, Terms, Privacy, Refund — DRAFT texts to review, publish refused until the
  placeholders are filled in; every published version kept) and Help & support (FAQs, contact options).
- App: Profile → Help & support (tap to call, WhatsApp or email; questions open on tap) and the published pages;
  sign-up links to Terms and Privacy. The refund policy is not shown in the iPhone app.
- Website: Help page, About / Terms / Privacy / Refund policy pages, footer links, sign-up links, sitemap.

### Added — 2026-10-07 (Phase 12c part 2: articles on the website and in search)
- Website: Articles in the header, "Latest articles" on the home page, the list by kind (and period for current
  affairs), article pages with their source link, search-engine data and sitemap entries.
- App search also finds articles.

### Fixed — 2026-10-07 (KI-050)
- Student search showed the titles of lessons that were still drafts or scheduled.

### Added — 2026-10-07 (Phase 12c part 1: articles)
- CMS: Communication → Articles — current affairs (daily / weekly / monthly / yearly), Gorkhapatra summaries (issue
  date and source link), news and blog; categories; cover image; practice quiz; featured; push / email per article;
  review / publish / schedule.
- App: Home → Read (Current affairs, Gorkhapatra, News), Profile → Blog; lists with period and topic filters; the
  article page with its source and a "Take the quiz" button. Notification settings gain "Articles and current affairs".
- API: migration `articles`; public `/articles`, `/articles/:slug`, `/article-categories`.

### Fixed — 2026-10-07
- Pictures used in notices could be deleted from the media library while the notice still showed them.

### Added — 2026-10-07 (How-to-get-courses box, D-062)
- Student emails (welcome, sign-up verification code, notices, course updates, exam reminders, results, buying
  links) now end with a highlighted box: on iPhone/iPad buy on the website with the same account; on Android in the
  app or on the website; "Already bought? You can ignore this." Emails now have an HTML version (plain text kept).
  Password and sign-in codes and receipts are unchanged. Text in System settings.
- App: the verify screen says "Important: check your email (look in Spam or Promotions too)".

### Added — 2026-10-07 (iPhone buyers, D-061)
- Every new student gets a welcome email (text in System settings) saying where courses are bought.
- CMS Sales → Interested on iPhone: students who opened a paid course they cannot buy in the iPhone app (noted
  quietly, with the device), and an "Email link" dialog that sends the course's website link (template in System
  settings → Buying link email).
- iPhone: a locked course now says "Course locked — your account doesn't have access to this course yet" with
  "Refresh access" (still no prices or buying pointers, as Apple requires).

### Fixed — 2026-10-07
- Erasing an account now also removes its push tokens, notifications and notification settings.

### Added — 2026-10-07 (EAS builds)
- The app is linked to the owner's EAS project (push tokens work in builds); `eas.json` with development, preview and
  production profiles; development client; shared packages are built during EAS builds.

### Added — 2026-10-07 (Phase 12b: event notifications)
- Students are told when a payment goes through (in the app and by push; the receipt stays the email), when a test
  result is out (unless they already opened it), and before a scheduled test opens (by default 1 day and 1 hour
  before, to the students who can take it). The Notifications list shows an icon per kind; Profile → Notifications
  offers push only for purchases, with "Receipts always come by email."
- CMS: course page → Notify students (title and message in English / Nepali, sent to everyone with access, list of
  sent updates; permission "courses: notify"); System settings → Exam reminders (on/off, up to three times).
- API: migration `event_notifications` (`attempts.result_notified_at`, `assessment_reminders`, `course_updates`);
  the worker's `notifications` job also sends results and reminders; `GET|POST /admin/courses/:id/updates`.

### Added — 2026-10-07 (Phase 12a: notices and notifications)
- Students: the Notice tab lists official notices, announcements and instructor messages (pinned first, a badge for
  new ones) and opens them in full; Home has a bell with unread notifications; Profile → Notifications chooses push /
  email per category. The app registers for push after sign-in (builds with an EAS project, KI-048) and opens the
  linked screen on tap.
- CMS: Communication → Notices — bilingual title and rich text, pin, expiry, "Send as push notification and email",
  review / publish / schedule, delete.
- API: migration `notices` (notices, notifications, notification outbox, push tokens, preferences); worker job
  `notifications` (fan-out and delivery with retries); endpoints under `/notices`, `/me/notifications`,
  `/me/notification-preferences`, `/me/push-tokens`, `/admin/notices`.

### Added — 2026-10-07 (Phase 11 part 4b: referrals)
- Students: Profile → Invite friends (personal code, share, what each side gets, reward coupons). Sign-up in the app
  and on the website takes a referral code (pre-filled from a `/r/<code>` link). The friend's first purchase gets
  the referral discount — or their coupon if bigger; the referrer then gets a one-time coupon only they can use.
- CMS: System settings → Referral programme (on/off, both discounts, reward validity, sale-price switches);
  Sales → Referrals; order pages show the referral discount. A full refund switches off an unused reward.
- API: migration `referrals`; `GET /me/referral`, `GET /admin/referrals`.

### Fixed — 2026-10-07 (local development, KI-047)
- `pnpm --filter @tk/web dev` failed ("--env-file-if-exists= is not allowed in NODE_OPTIONS"): the website now loads
  the root `.env` in a small launcher (`apps/web/scripts/next.mjs`).
- With the website's dev server running, the API dev server kept restarting (Windows file-access events made
  `node --watch-path` restart on mere reads), so pages failed: the API now restarts only when compiled files really
  change (`apps/api/scripts/dev-run.mjs`).
- The website shows a friendly "try again" page when the API cannot be reached.

### Added — 2026-10-07 (Phase 11 part 4a: public website)
- `apps/web` (Next.js): home with featured courses, course list and pages (CMS description, subjects, instructors,
  price), plans, checkout with coupons (share links included) and eSewa / Khalti, payment result, sign in / create
  account / verify email / reset password, My account (purchases, receipts, sign out), certificate check, sitemap.
  English and Nepali; BS dates. iOS users buy here (D-027). The student's tokens stay in HttpOnly cookies.
- CI: `web-e2e` job.

### Added — 2026-10-06 (Phase 11 part 3: receipts and refunds)
- Receipts: every paid order (including Rs 0 coupon orders) gets a numbered receipt, e.g. TK-2083/84-000001
  (prefix and yearly restart in System settings → Receipt numbers); "Tax Invoice" once VAT-registered. Students
  download the PDF from Purchases or after paying, and get it by email when payment is confirmed.
- Refunds: staff request a refund on the order page with the reason; someone with refund approval approves or
  rejects it and records the money as sent with its reference (Sales → Refunds lists the queue). A refund of the
  whole amount removes the access the order gave; a partial refund keeps it. Purchases show "Refunded".
- API: migration `receipts_refunds` (receipts that can never change, refunds, order status `refunded`); worker job
  `receipts-email`.

### Added — 2026-10-06 (Phase 11 part 2b: coupons and VAT)
- CMS: Sales → Coupons — percent or fixed discounts, dates, total and per-student limits, minimum price, where the
  code works (everything, all courses, all plans or chosen ones), "works on sale prices" (D-054), on/off; uses and
  recent orders; a share link that opens checkout with the code filled in. Orders show the coupon and VAT.
- CMS: System settings → VAT and business details (D-055): VAT-registered, rate, prices include VAT or not, business
  name, PAN / VAT number, address — no code change needed when the details arrive.
- Student app: checkout shows the server's price lines (price, sale, coupon, VAT, total), "Have a coupon?" with the
  reason when a code does not apply, and "Get access" when a coupon covers the full price (D-056). A share link
  opened while signed out continues after signing in.
- API: migration `coupons_tax`; `POST /orders/quote`; coupons checked and limited on the server under a lock.

### Added — 2026-10-06 (Phase 11 part 2a: plans)
- CMS: Sales → Plans — create a plan, write its card (bilingual name, description, feature check-list, highlight),
  price / sale / validity, choose its courses or cover all courses, publish; subscribers shown.
- Student app: Profile → Subscription plan → "Choose your plan" (features, included courses, price where the
  platform sells, "Your plan · until …"), plan checkout through eSewa / Khalti, renewal that adds the new period
  after the current one; Purchases shows plans.
- API: migration `plans`; plan orders settle like course orders; access follows the plan's current courses (D-054);
  plan holders open premium lessons and "plans only" tests.

### Fixed — 2026-10-06 (payments on Android, KI-042)
- eSewa showed "localhost refused to connect" on the Android emulator: in development the gateways now send the
  student back to the address the device reached the API on, and the app returns via its own link (Expo Go too).

### Fixed — 2026-10-06 (access, D-053)
- Joining a free course unlocked premium lessons of paid courses that share its subjects (KI-043). Premium content
  now needs paid access, a staff grant, a coupon or a referral; free enrolment opens free lessons only. Locked
  messages in the app say how to unlock.

### Added — 2026-10-06 (Phase 11 part 1: course purchase)
- Student app: Buy on paid courses (Android in-app and web; never iOS, D-027) → checkout (server price, eSewa or
  Khalti, "Test mode" while on test credentials) → the gateway's page → a result screen that waits for the server's
  confirmation → access; Profile → Purchases.
- API: migration `commerce` (orders, order items, payments, payment events); eSewa ePay v2 and Khalti KPG-2 with
  server-side verification, one idempotent settlement path, amount and duplicate checks, reconciliation worker; all
  gateway settings from `.env` (D-051); no rebuying while access is active (D-052).
- CMS: Orders (search, needs attention, payments with every gateway message, check again with the gateway);
  Settings → Payment methods.

### Fixed — 2026-10-06 (§10 hardening)
- Exam answers given offline were lost if the app was closed before the connection came back (KI-039).
- A save that reached the server late (after a lost connection) could overwrite a newer answer; it is now skipped
  (T-048, migration `answer_client_time`).
- CMS: revoking or reinstating a certificate right after typing a search could leave the list showing the old
  state (KI-040).

### Added — 2026-10-06 (§10 part 3c: mistake notebook)
- Student app: Profile → Mistake notebook — wrong and partly correct answers from tests and practice, revised one card
  at a time until answered correctly N times in a row (D-050), filter by subject, self-review for written answers,
  remove a question; "Saved to your mistake notebook" after a wrong practice answer; "Revise your mistakes" on
  results.
- API: migration `mistakes`; practice answers scored and recorded on the server; test mistakes join only after
  results are released (T-047); revision and removal endpoints.
- CMS: Settings → Mistake notebook (correct answers in a row, default 2).

### Fixed — 2026-10-06 (part 3c)
- Practice questions showed "1 marks"; now "Marks 1".

### Added — 2026-10-06 (§10 part 3b: certificates)
- CMS: Certificates (templates with wording, signatories, share of lessons, language, sample PDF; issued certificates
  with search, revoke with a reason and reinstate), a Certificate tab on courses, Settings → Certificate verification.
- Student app: Profile → Certificates (open the PDF, share), certificate progress on the course page, a "Certificate
  earned!" dialog when finishing a lesson earns one (D-050).
- API: migration `certificates`; automatic issue (T-046), public verification and PDF by certificate number (Nepali
  shaping with the Mukta font, BS date, QR code), permission `certificates:manage`.

### Fixed — 2026-10-06 (part 3b)
- The back arrow over a course's image was almost invisible in dark mode.
- The API's default per-IP request limit (300 a minute) can now be raised with `RATE_LIMIT_DEFAULT_PER_MINUTE`
  (KI-038); browser test suites no longer run into it or into the staff sign-in limit.

### Added — 2026-10-06 (§10 part 3a: daily challenge, streaks, leaderboards)
- Student app: daily challenge card on Home with the streak (D-049), past challenges as practice, rank on results,
  leaderboard screen, "answered · marked" counter in exam mode; time warning in the last minute for short tests.
- API: migration `streaks` (`user_streaks`, `attempts.practice`); today / past challenges, streak and leaderboard
  endpoints; ranks from official attempts (T-045).
- CMS: Settings → Leaderboards (names shown) and Daily challenge (past challenges as practice); results mark practice.
- Design canvas (D-047) reviewed; remaining elements mapped to phases (DESIGN_SYSTEM §10).

### Fixed — 2026-10-06 (part 3a)
- A student who skipped onboarding could be sent back to it after restarting the app (KI-037).
- "1 questions" → "1 question".

### Added — 2026-10-06 (§10 part 2: grading and results)
- CMS: **Grading** page (written answers with the model answer, marks and a comment; corrections), **Results** per
  assessment (statistics, attempts, one attempt in full), **Release results** for manual release.
- Student app: the teacher's comment in the answer review.
- API: grading queue, grade, results, attempt detail, release endpoints; E2E editor role gets `grading:manage`.

### Fixed — 2026-10-06
- CMS assessment search no longer widens a scoped staff member's view (KI-035).

### Added — 2026-10-04 (§10 part 1: taking tests)
- Student app: Tests tab on the subject screen, Tests on the course page, "Tests for your exam" on Home, test page
  with the rules, exam mode (timer from the server's deadline, question palette, mark for review, autosave with an
  offline copy, confirm submit, automatic submit when time runs out), result (score ring, pass/fail, counts,
  sections), answer review with explanations, self-marking of written answers, Profile → My test results.
- API: migration `attempts` (attempts, attempt answers, three attempt rules per assessment); student assessment and
  attempt endpoints; worker job submits attempts whose time ran out.
- CMS: Premium access, Late start and Official attempt per assessment; Settings → Assessment defaults and Exam timing.

### Added — 2026-10-04 (Sentry in the student app and Admin CMS)
- Student app and Admin CMS report unexpected errors to their own Sentry projects (`EXPO_PUBLIC_SENTRY_DSN`,
  `VITE_SENTRY_DSN`) with no user, breadcrumbs, screenshots, replay or tracing; only the page path is kept.
  Expo config plugin added for native crash reports in development / store builds.
- `@sentry/cli` is not allowed to run install scripts (native binary, KI-011).

### Added — 2026-10-04 (monitoring and analytics, T-042)
- API + worker report unexpected errors to Sentry when `SENTRY_DSN_API` is set, with personal data switched off and
  scrubbed; `pnpm --filter @tk/api cli monitoring-test` sends a test error.
- Student app sends product analytics to PostHog when `EXPO_PUBLIC_POSTHOG_KEY` is set: screens by route pattern and
  11 events (sign-up, login, enrol, lesson opened / finished, practice check, report, bookmark, search, deletion
  request), identified only by a pseudonym. `GET /me` returns `analyticsId`.
- Google sign-in button appears on the web build once `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` is set (owner's client id).
- Browser test builds never use the developer's real Google or PostHog values.

### Added — 2026-10-04 (Phase 9, part 2: practice, bookmarks, search, profile)
- Student app: Questions tab on the subject screen (all question types, Check answer / Try again, explanation,
  model answer, passages, Premium lock with a link to the course), report a question, save lessons and questions,
  Saved list, search from Home (courses, lessons, questions), Profile links, Edit profile (date of birth in BS,
  gender, education level), Change / Set password, Signed-in devices (sign out others), Delete account with the
  scheduled date and "Keep my account".
- API: migration `bookmarks`; `GET /courses/:courseId/subjects/:subjectId/questions`, `GET /practice-questions/:id`
  (answers withheld when locked), `GET /me/bookmarks`, `PUT/DELETE /me/bookmarks/:type/:id`, `GET /search`.

### Fixed — 2026-10-04
- Web build: text inputs no longer draw the browser's square focus ring over the rounded focus border.
- `format:check` ignores the student E2E web build output (`dist-e2e`, `expo-env.d.ts`).

### Fixed — 2026-10-03
- YouTube lessons did not play ("Video player configuration error", error 153): YouTube embeds now send a Referer
  (T-040); Bunny embeds still send none.
- Android emulator: the app finds the API at `10.0.2.2` when served through `adb reverse`; new
  `pnpm --filter @tk/mobile android` script (IPv4 Metro + localhost mode).

### Added — 2026-10-03 (Phase 9, part 1: student learning)
- Student app: Courses tab (my courses with progress, catalog for my exam or all, search), course page (subjects,
  counts, description, teachers, Enrol for free / price / iOS without prices), Home current course with switcher and
  Continue, subject outline (Notes / Videos, chapters, states), lesson screen (note reader with A−/A+ and language,
  PDF reader, video), Mark as finished, previous / next lesson, locked and verify-first states.
- API: migration `learning_progress`, `PUT /learning-items/:id/progress`, `GET /me/continue`, progress in the outline
  and `/me/courses`, self-hosted PDF reader `/viewer/pdf` (pdfjs-dist 6.3.289).
- `formatNpr` shows Devanagari digits for Nepali in every JavaScript engine.

### Added — 2026-10-03 (Phase 8: student app foundation)
- `apps/mobile`: Expo SDK 57 + Expo Router student app — sign up, login (device-limit choice), forgot/reset password
  by code, email/SMS verification, onboarding target post, tabs (Home, Courses, Notices, Profile), language (en/ne)
  and theme (auto/light/dark), BS dates, maintenance and force-update screens, offline banner, empty/error/loading
  states. All content comes from the API/CMS.
- API: migration `user_target_posts`, `GET/PUT /me/target-posts`, `childCount` on `/exam-nodes`, setting
  `app.storeLinks` (admin settings page + `/app/config`); `X-TK-App-Version` allowed by CORS.
- Development: the app finds the local API automatically (no `apps/mobile/.env`; web uses `127.0.0.1` to avoid IPv6
  `localhost`); with `APP_ENV=development` the API accepts any `http://localhost:<port>` origin (staging/production:
  `CORS_ALLOWED_ORIGINS` only).
- `@tk/e2e-support`: shared browser-test harness (admin suite now uses it); student-app Playwright suite + CI job
  `mobile-e2e` with Mailpit. OTP policy constants moved to `@tk/contracts`.

### Added — 2026-10-03 (Phase 7: assessment builder)
- Migration `assessments`: assessments, sections (fixed / random), section questions; DB rules for windows, one
  daily challenge per day, section shapes and non-negative marks.
- Admin API: create/edit with every rule chosen per assessment (D-021, D-044), section structure, readiness report
  (unpublished/deleted questions, too-small random pools, mixed marks, written answers without a grading mode,
  impossible pass marks), publish/schedule only when ready, scopes, audit.
- Setting `assessments.defaults` (D-017 prefill; scoring choices unset).
- Admin CMS: Assessments list and editor (details, timing, scoring, results/display, sections with a question
  picker and random pools, readiness + publishing).
- Questions used by live assessments cannot be deleted.

### Added — 2026-10-03 (Phase 7: Excel question import)
- Import page in the admin (Question bank → Import): upload the template, preview every problem by row and column,
  import the ready rows as drafts; passages created and linked; recent imports listed.
- API: `question_imports` table (migration `question_imports`), preview/commit/history endpoints; names of
  subjects, chapters, topics, category paths and papers resolved within the editor's scope; duplicate-text warnings;
  re-checks at confirm time; audit entry per import.

### Added — 2026-10-03 (dynamic admin audit)
- `docs/DYNAMIC_ADMIN_AUDIT.md`: inventory of what is admin-managed, hard-coded or intentionally code-controlled.
- **Category types** are admin-managed (`exam_node_types`): rename, re-order, add levels such as sub-group and exam
  stage, attach papers to any type that allows them; new "Category types" page; public `/exam-node-types`.
- **Question types** can be switched off and renamed in System settings; `/app/config` publishes them.
- **Question import template** (`docs/templates/question-import-template.xlsx`, also downloadable from the Question
  bank with live dropdowns) and the row parser the importer will use.

### Fixed
- Concurrent free-course enrol requests could create duplicate access rows (race on the start time).

### Changed
- Signed Bunny embed links last 5 minutes (was 4 hours) — verified safe for long videos.
- Course editor checkboxes keep type hints out of the accessible name.

### Added — 2026-10-03 (Phase 7: question bank, backend)
- Scoring engine in `@tk/domain`: all question types, configurable partial credit, negative marking, optional zero
  floor, exact centimark arithmetic (D-044, T-030).
- Question schemas in `@tk/contracts` with answer-key validation per type; `richDocText`.
- Migration `question_bank`: questions, immutable question versions (trigger), passages, tags, PYQ sources,
  question reports. New permissions for questions, reports, assessments and grading.
- Admin question API (versions, workflow, scopes, tags, passages, reports) and student question reports.
- Admin CMS: **Question bank** list (search, subject/type/difficulty/status/PYQ/tag filters) and editor for all 7
  types (bilingual rich text, compact option editors, Insert blank, match pairs, numeric tolerance, model answer,
  explanation, passages, tags, previous-year sources, publishing, version info); **Question reports** queue.

### Fixed
- Images used only inside course descriptions could be deleted from the media library; rich-text usage now also
  covers course descriptions, passages and question versions.
- Course editors without `taxonomy:manage` could not load exam categories and papers in the course editor; read
  access now also covers course, question and assessment editors (writes still need `taxonomy:manage`).

### Added — 2026-10-02 (Phase 6: content API)
- S3-compatible object storage (SeaweedFS locally and in CI, Cloudflare R2 in production) and a media library with
  server-validated uploads (WebP image variants, private PDFs, signed URLs).
- Content schema: exam taxonomy, papers, subjects/chapters/topics, learning items (note/PDF/video), video assets,
  courses, instructors, entitlements.
- Admin content API with publish workflow, scheduling, reorder, soft delete/restore, instructor scoping and audit.
- Student/public catalog and learning API: platform-aware prices (D-027), server-side locking of premium content,
  per-student watermarked PDFs, YouTube nocookie and signed Bunny Stream playback.
- Admin access grants/revokes (until payments arrive in Phase 13).
- Free-course enrolment (`POST /courses/:id/enrol`, D-043) with access validity from the course settings
  (`accessEndsAt` in `@tk/domain`; fixed dates end at midnight Nepal time).
- Tests never use real video-provider keys from a developer `.env`.
- Admin CMS: **Media library** (multi-file upload, public/private, preview, descriptions, delete), reusable media
  picker, **Exam categories** tree (add inside, edit/move, publish/unpublish/archive, reorder, delete/restore) and
  **Papers** (marks, time, pattern, linked posts, status); "Content" navigation group.
- Admin CMS: **Subjects** list and subject outline (chapters → topics → items: add, edit, status, reorder, delete),
  **item editor** for notes (TipTap rich text in English and Nepali, images from the media library, tables, links),
  PDFs (download flag) and videos (Bunny or YouTube, duration), access level, language, publishing and scheduling in
  Nepal time, unsaved-changes guard.
- Admin CMS: **Courses** list and course editor (details with rich description and thumbnail, pricing in rupees with
  sale window and validity, ordered subjects with paper and display marks, exam categories and instructors,
  publishing/scheduling, delete), **Instructors** profiles, **Course access** on the student page (grant with the
  course's validity / a date / lifetime, revoke with reason, history) and **Limit content access** for staff.

### Fixed
- CI: SeaweedFS readiness wait and volume settings; server errors now logged in CI test output.
- Admin `Button` no longer submits forms by default; renamed a form field that clobbered `form.nodeType`.
- API: expected 5xx errors (e.g. video provider not configured) are logged as warnings, not unhandled errors.
- Admin: subject outline and page headers no longer overflow on phones.

### Added — 2026-10-02 (Phase 5: Admin CMS foundation)
- Staff two-factor authentication (TOTP + recovery codes, encrypted secrets, replay protection, policy setting with
  forced enrolment for Super Admins); two-step staff login.
- Education levels (public list, admin CRUD/reorder); admin dashboard counts; audit entries name their actor.
- `@tk/design-tokens` with WCAG contrast tests; BS date helpers now work in browsers.
- `apps/admin` Admin CMS: sign-in/2FA/password flows, permission-aware shell, dashboard, students, staff, roles &
  permissions, education levels, system settings, audit log, account security; light/dark theme; responsive.
- Tests: admin unit tests and Playwright E2E (new CI job `admin-e2e`).

### Fixed
- Contrast of danger text on soft red (light) and primary hover (dark).
- `Button asChild` crash; 2FA code field pre-filled with the email; dashboard request during forced 2FA.

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
