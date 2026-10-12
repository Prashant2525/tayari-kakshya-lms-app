# Test Status

Last updated: 2026-10-13 (Phase 16 test pass). `pnpm test` runs unit + integration suites (needs `pnpm infra:up`);
`pnpm build && pnpm --filter @tk/admin e2e` and `pnpm build && pnpm --filter @tk/mobile e2e` run the browser suites
(the student suite also needs Mailpit, part of `pnpm infra:up`).

## Current results — all passing locally

| Package | Tests | Kind |
|---|---|---|
| `@tk/design-tokens` | 39 | WCAG contrast for every text/background pair (light + dark), CSS generation |
| `@tk/domain` | 64 | BS calendar, Kathmandu day boundary, fiscal year, money/VAT/discounts, access validity |
| `@tk/contracts` | 21 | Schema behaviour (localized text, email normalisation, mass assignment, settings defaults, rich-text validation) |
| `@tk/api` | 328 | Integration against real PostgreSQL + Redis + S3 (SeaweedFS) through the HTTP stack; TOTP RFC 6238 vectors; RBAC, video, watermark unit |
| `@tk/admin` (unit) | 35 | API client (headers, refresh single-flight, retry, session loss, error mapping), BS formatting, Button `asChild` regression |
| `@tk/admin` (E2E, Playwright) | 38 | Real browser + real API + `*_e2e` database |
| `@tk/mobile` (unit) | 45 | Saved PDF cut into pieces, Offline licence rules (expiry, clock set back, saved pictures), Study-time meter (idle limits, videos, innermost screen, background), development picture addresses on a phone, API client (single-flight refresh, early refresh, session end, maintenance), translations complete in both languages, BS dates and Kathmandu weekday, force-update/maintenance gate, form checks, Nepali phone numbers |
| `@tk/mobile` (E2E, Playwright, phone viewport) | 46 | Web build + real API + `*_mobile_e2e` database + Mailpit |
| `@tk/content-pack` | 28 | Markdown dialect → rich text; every pack payload valid against the API schemas; free first chapter; enough questions per quiz and subject test; note length; handouts render with no lost characters |
| `@tk/web` (unit) | 8 | Session refresh used once (concurrent / late requests share it; refused → signed out; unreachable → retried), token expiry, both languages complete, failure messages |
| `@tk/web` (E2E, Playwright) | 10 | `next start` production build + real API + `*_web_e2e` database + Mailpit + gateway stand-in; access tokens last 60 s so every page load refreshes |
| **Total** | **665** | |

### Phase 16 — systematic test pass (T-077)
**Coverage map** (automated suites per playbook area): authentication (auth 21, verification 13, mfa 11, browser
sign-up / log-in / reset), course browsing + enrolment (catalog 16, mobile learning 4, website 4), payments (payments 8,
receipts-refunds 5, coupons 9, plans 5, referrals 6, mobile purchase 6, CMS orders / refunds), premium access (catalog,
practice, offline, live), notes / PDFs / videos (catalog, media, learning, offline), questions (questions 10, import 4,
practice 6, mistakes 5), quizzes / mock / weekly exams / scoring / results (attempts 14, assessments 6, grading 4,
engagement 4, mobile exam 4 + daily 2, domain scoring unit tests), progress (progress 6 + analytics 3, planner),
notifications (notices 5, event-notifications 6, live 2), current affairs (articles 3, website + app articles),
Admin CRUD (content-admin 11, admin 17, CMS browser 38), RBAC + security (route-security 5, mfa, env, erasure).

**Exploratory pass on the real content (dev database, demo student):** catalogue, outlines, free first chapter,
premium lock (403, no body), premium note + watermarked PDF after a grant, chapter quiz (rules: 1 mark, no negative,
pass 40 %, best attempt), subject test (20 random questions of 5 types, 30 min), leaderboard, search, articles,
notices, plans, live list; app screens (Home, Courses, course, outline, note with tables, PDF reader, practice,
tests); website sitemap — 14 pages, all 200. **Defects found and fixed:** see CHANGELOG 2026-10-13 (burst submits,
match order, CORS methods, owned-course price, pack answer positions, importer command).

**Load test (weekly-exam burst, one API process on this Windows PC, Docker PostgreSQL):**

| Students at once | Errors | start p50 / p95 | save p50 | submit p50 / p95 | result p50 |
|---|---|---|---|---|---|
| 200 — before the fix | **100 submits (500)** | 3.2 s / 3.3 s | 0.64 s | 3.0 s / 3.3 s | 0.75 s |
| 200 — after | 0 | 3.2 s / 3.4 s | 0.68 s | 2.5 s / 2.6 s | 1.4 s |
| 500 — after | 0 from the API (86 connections refused by Windows before reaching it) | 6.7 s | 1.6 s | 6.0 s | 2.6 s |
| 1 at a time (baseline) | 0 | 48 ms | 22 ms | 47 ms | 15 ms |

**New tests:** API — match column shuffled under "shuffle options" and still marked by id (1); CORS preflight
allows PUT / PATCH / DELETE for allowed origins and nothing for others (1). Content pack — scrambling keeps the
intended answer (3) and no answer position above 40 % / match columns not in answer order (1); every objective
question in all five courses scores full marks with its own key and not with another answer (5). App browser — a
course the student has shows "You have access", not a price (extended). **Mutation checks: 4 of 4 caught.**
The transaction wait / pool change is covered by the load test (manual), not by an automated test.

### Added with the configuration & deployment guide (T-076)
- **API (7):** a complete production configuration starts; production refuses Bunny without the token key, re-used
  secrets and an http media address; messages never contain values; `config-check` review finds nothing in a
  complete production configuration, flags development credentials, placeholder sender, local storage, shared
  buckets, http website / missing payment return, local CORS, and eSewa's test merchant in production; only
  informational on a development machine.
- **Website (3):** production settings accepted; loopback http allowed for local production tests; missing / http /
  invalid addresses named without their values.
- **Manual:** `config-check --connect` against the development `.env` — database (34 migrations applied), Redis,
  buckets, Mailpit SMTP, Bunny key all OK; `expo config` with `EAS_BUILD_PROFILE=production` stops without an https
  `EXPO_PUBLIC_API_URL` and resolves with one; `GOOGLE_SERVICES_JSON` appears as `android.googleServicesFile`.
- Student browser suite 46/46 after the app-config change. The website build and its browser suite run in CI.

### Added with Phase 15 security hardening (T-075)
- **API (13 new, 1 extended):** route inventory over all 345 routes (public list, staff-only `/admin` with
  permissions, student-only elsewhere — 4); `TRUST_PROXY` parsing and the production refusal (4); log URL redaction
  (2); erasure coverage over the schema (1); staff 2FA — 5 guesses per sign-in, then even the right code is refused
  (1); the 2FA policy setting refused for a non-Super Admin with `settings:update`, allowed for a Super Admin (1);
  erasure removes lesson progress (extended).
- **Mutation checks (7 of 7 caught):** per-sign-in 2FA limit removed; Super Admin check removed; staff audience
  dropped from a CMS controller; a route made public; `TRUST_PROXY=true` allowed in production; `sig` not redacted;
  lesson progress not erased. The erasure coverage test also fails when the live-attendance line is commented out.
- **Browser suites unchanged and passing:** CMS 38/38, student app 46/46. The CMS settings card for the 2FA policy
  (read-only for non-Super Admins) was not screenshot-checked — no seeded non-Super-Admin account has
  `settings:update`; the server-side refusal is tested.
- `pnpm audit --prod --audit-level high` passes with two reviewed exceptions (SECURITY_REVIEW R-1).

### Added with live classes (D-072, T-074)
- **API (2, `live.e2e.test.ts`):** drafts hidden from students; publishing notifies students with course access but
  not a visitor or a student with only a free enrolment (Premium class); the link is never in a list or detail;
  joining before the window → 409 with `opensAt` and no link; a student without access → locked; the worker sends the
  reminder, takes the class live (notified) and ends it after its length plus grace; joining returns the
  youtube-nocookie embed and records attendance (joins counted); attendance list and audited CSV; recording set and
  played back; audit actions without link or passcode. Second test: a Free Zoom class with the join window changed
  in the CMS setting, rescheduling notifies the new time, cancelling notifies and stops joining, permissions (403
  without `live:manage`, 401 signed out), staff list filters.
- **Mutation checks (5 of 6 caught):** join without the access check, Premium recipients not limited, join window
  ignored, drafts visible, link in the student view — each fails the tests. Removing the "reminder already sent"
  check is not caught by design: the reminder's notification source key also stops a second send (two independent
  guards).
- **Admin browser (2):** schedule a Free Zoom class (empty form refused; a YouTube link for Zoom refused by the
  server), publish, the seeded student's early join refused without the link, Go live, the join returns the Zoom link
  and passcode and appears in Attendance; End (form locked), add the recording, listed under Past with 1 joined.
- **Student browser (3):** the course page lists both classes; Home shows "Live now"; the class screen plays the
  YouTube class in the app (youtube-nocookie iframe); the Premium class is locked for a free-enrolled (seeded, fourth) student and no
  response carries the Zoom link or passcode; Past is empty; Profile → Notifications has the Live classes switch.
- **Screenshots** (CMS 1440 px: list, live class with attendance, scheduled Zoom class; app phone viewport: Home,
  course page, class before and after joining with the video playing, Zoom class before its window, locked Premium
  class, list, notification settings) — checked by eye.

### Added with the university content pack (D-071, T-073)
- **Unit (19):** the Markdown dialect (marks, nesting, escapes, lone markers; blocks; output accepted by the
  rich-text validator); for each of the 5 courses — course, pricing, subject, chapter, topic, note, PDF, question,
  quiz and subject-test bodies valid against `@tk/contracts`, first chapter free, at least 5 objective questions
  per quiz and 20 per course, notes of at least 150 words, handouts that render with no unmappable characters;
  categories (rank order), plans, coupons, notices and articles valid.
- **API (1 test extended, mutation-checked):** a random section limited to objective types is not flagged for the
  subject's written questions (fails with the old readiness check).
- **Import into the local dev API:** 5 courses, 5 subjects, 24 chapters, 79 topics, 79 notes, 24 PDF handouts and
  lessons, 256 questions, 24 quizzes, 5 subject tests, 6 categories and 3 category types, 2 plans, 2 coupons, 4
  notices, 3 articles; a second run created nothing. Checked in the Admin Portal (courses, categories, question
  bank, assessments, plans, coupons), on the website (course list and page, plans, article) and as a student: the
  free chapter's handout downloads watermarked; a premium chapter's is refused (403).

### Changed: scroll motion, status bar, Profile (D-070, T-072)
- Student browser suite 43/43 (Profile heading and tabs unchanged for the tests).
- **Browser screenshots** (light, dark; full and short screens): Home and Profile at the top and scrolled (navy
  compact bars), Courses and Notices scrolled (compact bar with shadow), notices rising in.
- **Device check (Android emulator, Expo Go):** status bar icons light on Home and Profile, dark on Courses
  (KI-056 fixed).

### Changed: launch intro, motion and refreshed look (D-069, T-071)
- No new automated tests (visual change); the student browser suite (43) passes with the custom tab bar (same
  roles and labels, including "Notices, 2 new").
- **Browser screenshots** (phone viewport, light, dark, Nepali): Home hero with floating search, sliding tab pill,
  course list with raised cards and the new artwork; the intro frame by frame (switched on locally for the web
  build) in English and Nepali.
- **Device check (Android emulator, Expo Go, protection switched off locally for screenshots):** the intro plays
  on the native driver (T and K meet, tile, name, slogan, opening into the sign-in screen); a tab switch caught
  mid-way shows the screen fading and shifting in. Fixed: Android clipped the slogan's second word (Devanagari
  measured narrower than drawn) — the intro's text lines now span the full width.

### Added with offline PDFs (Phase 14a part 2, T-070, D-067)
- **API:** the offline test now covers PDFs (locked without access, a licence and `readerVersion` with it, renewed,
  revoked when access ends; videos still refused) and the reader page (same version as named, self-contained:
  `default-src 'none'`, pdf.js and worker inlined, no `src=` / `<link>` / `connect-src`). **Unit (2):** a pdf.js
  build turned into an inline script (export removed, `</script` escaped, fails loudly when pdf.js changes shape);
  the real page has a stable version. Mutation-checked (5: videos allowed, PDFs not renewed, no reader version,
  export kept, CSP dropped — each fails a test).
- **App unit (1):** a saved PDF cut into base64 pieces that decode on their own.
- **Browser check (Chromium, every request blocked):** the reader page renders a 3-page PDF posted in pieces, opens
  at the asked page, reports `loaded` / `page`, makes no requests and logs no errors.
- **Device check (Android emulator, Expo Go):** a premium PDF saved from the lesson; with the API stopped and a cold
  start the lesson opens from the saved copy (offline banner) and the watermarked pages render ("Page 1 of 3"),
  scrolling reports "Page 3 of 3"; Downloads lists it with the PDF icon. (Screen protection was switched off locally
  for the screenshots only.) The browser suites run the web build, where offline is not available.

### Changed: screen protection on every screen (D-068)
- **Device check (Android emulator, Expo Go, the app suite's API):** screenshots are black on the sign-in screen,
  onboarding, Home, a **free** lesson, and Home again after going back; a screenshot of the Android home screen (the
  control) is not. No automated test: the browser suites run the web build, where screen capture cannot be blocked.

### Added with offline notes and screen protection (Phase 14a part 1, T-069, D-067)
- **API (1 integration test):** the app config, a note with its licence (CMS days), premium only with access, no
  videos / PDFs yet, renewals with the CMS days, a new version after an edit, revocation when access ends or the
  lesson is unknown, offline switched off (no downloads, everything revoked), limits and audiences.
  Mutation-checked (5: switch ignored for downloads / renewals, access loss not revoked, days ignored, videos
  downloadable — each fails a test).
- **App unit (3):** licence expiry, a clock set back, saved pictures. **CMS E2E** (System settings): Offline lessons
  days saved.
- **Device check (Android emulator, Expo Go, the app suite's API and data):** save a premium note with a picture;
  with the API stopped it opens from the saved copy with the offline banner (7 days → "until 1 Kartik 2083");
  after a cold start without the server the app opens (fixed: it used to stop at "Could not reach the server") and
  Downloads → the note opens offline; screenshots of the premium lesson are black, Downloads on top is not (fixed:
  the block stayed on for screens opened on top). Offline storage is not on the web, so the browser suites do not
  cover it.

### Added with reports (Phase 13e, T-068, D-066)
- **API (3 integration + 2 unit tests):** sales per Nepal day (paid orders only, refunds sent, net, channels,
  providers, top items), the default and wider periods, a period ending yesterday leaving today out, refused periods
  and permissions; students, learning (enrolments, lessons, study time, sources, top courses / lessons) and tests
  (hardest questions only from 10 answers, partly correct as half; reported questions); CSV exports (BOM, headers,
  BS / AD dates, rupees, a formula-like name neutralised, row count, audit, permission); the CSV writer (quoting,
  formula guard, BOM, CRLF). Mutation-checked (6: refunds not subtracted, period end, minimum answers, exports not
  audited, formulas not neutralised — each fails a test; counting pending orders cannot change a result: they have
  no paid time).
- **CMS E2E** (admin spec): Reports tabs, 30 → 7 daily bars when the period changes, the Students CSV downloads with
  its header, and the download is in the audit log.
- Screens checked: Sales and Learning tabs.

### Added with discussions (Phase 13d, T-067, D-066)
- **API (2 integration tests):** lesson threads (premium needs access), posting checks, replies one level and in
  their own thread, the asker notified (no email), teacher answers badged, one best answer per doubt, reports (not
  one's own), hide → gone for students (staff still see it), show again, dismiss reports, posting bans (past time
  refused, staff cannot be banned), deleting (placeholder when replied to), audit, erasure; question threads only
  after answering (practice, written questions, premium with access, a test only once released). Mutation-checked
  (10: question before answering, unreleased test, premium lesson, ban ignored, hidden shown, nested replies, no
  notification, own post reportable, hide keeping reports open, erasure keeping posts — each fails a test).
- **App E2E (2):** no Discussion link before checking → ask (too short refused) → a teacher answers (badge, best
  answer) → report a post → the reply notification; a lesson's discussion from its header. **CMS E2E (1):** a
  reported doubt: answer as a teacher, mark best, hide with a reason, stop the student posting (their next post is
  refused).
- Screens checked: app thread, CMS list and thread dialog.

### Added with course reviews (Phase 13c, T-066, D-066)
- **API (2 integration tests):** only for a course the student has and after the CMS share of lessons (with the
  shares in the error); stars and text validated; waiting reviews are not public and do not count; moderators only;
  approve → public with a short name and the rating on the course page, the list and My courses; reject needs a
  reason the student sees; approving later counts it; a changed review waits again; names per the CMS; audited;
  delete; erasure; not for courses that are not live. Mutation-checked (8: waiting reviews public, waiting counted,
  progress not required, course not required, edit keeping approval, names ignored, no audit, erasure keeping
  reviews — each fails a test).
- **CMS E2E (1):** a review waits, is rejected with a reason, then published from Rejected; the course shows the
  rating. **App E2E (1):** not enough progress → finish the lesson → write a review (stars required) → waiting →
  approved → published with the rating. **Website E2E (1):** an approved review and the rating on the course page,
  and `aggregateRating` in the JSON-LD.
- Screens checked: app course page, website course page, CMS reviews; fixed: "1 reviews" (singular wording), a
  JSON-LD escape that did not escape.
- Website E2E: the reviews spec signs in as the second seeded editor (staff sign-in allows 5 per account per 15 min).

### Added with the study planner (Phase 13b, T-065, D-066)
- **Domain (6):** spreading work in order within the minutes a day; today's finished work kept and counted; a test
  on its opening day without holding up the rest; what does not fit and the pace needed; nothing after the exam
  day; month and year ends.
- **API (2 integration tests):** only for a course the student has; exam date and minutes validated; estimates
  (note, PDF pages, video length, test limit); course order with the test after the lessons; a finished lesson
  ticked today; re-planned two days later and behind; a submitted test done; list with today only; other students
  and staff; one plan per course; delete; erasure; premium lessons and tests left out for a free enrolment; a test
  planned on its opening day; closed tests and ones opening after the exam left out. Mutation-checked (7: premium
  without access, closed tests, tests before they open, submitted tests still left, plan without the course, any
  exam date, erasure keeping plans — each fails a test).
- **App E2E (2):** make a plan (course, BS date, 30 min a day), on-track message, finish a lesson from the plan →
  ticked and "1 of 2 done today" in the plan and on Home; delete the plan. **CMS E2E** (System settings): planner
  estimates saved.
- Screens checked: plan, Home card; fixed: the plan's summary line wrapped badly ("30 / min").
- E2E: a third seeded student (`E2E_STUDENT3_EMAIL`).

### Added with progress analytics (Phase 13a, T-064, D-066)
- **API (3 integration tests):** study time per Nepal day and activity, never more than the time since the previous
  report, out-of-range values refused, 7 / 30-day totals, only the student's own, students only; accuracy from
  server-scored practice and revision answers and **released** test answers only (a manual-release test counts only
  once released), partly correct as half, by subject, weak / strong topics with the minimum number of answers, the
  window, other students' data never mixed in, erasure; thresholds with the weak line above the strong one refused.
  Mutation-checked (6: clock not checked, unreleased tests counted, revision not recorded, minimum answers ignored,
  unreleased results listed, erasure keeping answers — each fails a test).
- **App unit (4):** the study-time meter. **App E2E (2):** time on a practice question is measured and sent when the
  screen closes (the request and the credited seconds checked); My progress shows accuracy, subject, strong topic
  and empty states; the Home card opens it. **CMS E2E** (System settings): the Progress analytics card refuses a
  weak line above the strong line and saves.
- Screens checked: My progress, Home card, CMS card; fixed: an empty week showed no chart (bars now have a track).
- E2E: a second seeded student (`E2E_STUDENT2_EMAIL`) — sign-up allows 10 accounts per IP per hour.

### Added with banners (Phase 12d part 2, T-063)
- **API (2 integration tests):** banners by placement, order, switch and dates; on iPhone no plan or web links and
  no iPhone-hidden ones; images and links in the answer; the picture is in use until the banners go; changes
  audited; http links, unknown courses, unknown pages, a value without a link, an end before the start and a
  missing picture refused; only banner managers. Mutation-checked (6: plan / web links on iPhone, iPhone-hidden
  ignored, dates, placement, unknown course accepted, picture not counted — each fails a test).
- **CMS E2E (1):** upload a picture, add a banner (http refused, https saved, end date) → "Showing", "Not on iPhone".
  **App E2E (1):** a Home banner opens its article. **Website E2E (1):** a home-page banner opens its page.
- Screens checked: CMS banners list, app Home with a banner, website home; fixed: a single banner was too tall on
  wide screens.

### Added with pages and Help & support (Phase 12d part 1, T-062, D-064)
- **API (3 integration tests):** the four pages start as unseen drafts; publishing refused while the DRAFT line or
  placeholders remain, and when nothing changed; readers keep the last published version; versions numbered and
  kept — the database refuses to change or delete one; the refund page not served to the iPhone app; only page
  managers; FAQs in order, hidden and iPhone-hidden ones left out; contact values checked by type (phone, email,
  https), hidden ones left out, deletes audited; only support managers. Mutation-checked (5: drafts publishable,
  refund on iPhone, iPhone-hidden FAQs, unchanged republished, inactive FAQs — each fails a test).
- **CMS E2E (1):** the Terms draft is "not ready" and cannot be published; an FAQ and a WhatsApp contact (a wrong
  number refused first) are added. **App E2E (1):** Profile → Help & support (contact link, FAQ opens) and a
  published About page. **Website E2E (1):** footer → Help (WhatsApp link, an iPhone-hidden FAQ is on the web) →
  About; an unpublished page is a 404; sign-up links the Terms page. Sitemap unit test extended.
- Screens checked: CMS page editor and Help & support, app Help & support, website Help with footer links.
- Website page links (footer, sign-up) are cached for a minute; the test waits for them (an earlier spec may have
  loaded the list before the pages were published). Local only (KI-036, ~1 GB free memory): the CMS suite's servers
  stopped at the grading spec once; the 15 tests after it passed on their own. App 35/35, website 8/8.

### Added with articles on the website and in search (Phase 12c part 2, T-061)
- **API (extended):** search finds live articles by title or address — not the draft, scheduled or deleted ones
  with the same title; a draft lesson is not found either (KI-050: both failed with the old filters).
- **Website unit (2):** the sitemap lists the fixed pages, every course and every article across pages; still the
  fixed pages when the API is down.
- **Website E2E (2):** home → Latest articles → All articles → Gorkhapatra tab → card (summary, BS date) → article
  (text, source link with nofollow, page title, NewsArticle data); `/articles` in the sitemap; an unknown address
  is a 404. **App E2E (extended):** search finds the article and opens it.
- Screens checked: article page (desktop), articles list (phone).

### Added with articles (Phase 12c part 1, T-060, D-063)
- **API (3 integration tests):** rules per kind (current affairs period and date; Gorkhapatra date and https
  source; no period elsewhere; address format and unique); writers draft, only publishers publish, change live ones,
  delete (which frees the address) and manage categories; categories must match the kind; signed out and signed in
  read the same live list — not drafts, scheduled or deleted ones — filtered by kind, period, category, featured;
  summary from the text when empty; only shown categories; "notify" reaches every student once (each student's
  choice kept, email sent); article covers and pictures, and pictures in notices, cannot be deleted while used.
  Mutation-checked (7: drafts listed, category kind, both send guards, address not freed, cover not counted,
  notice pictures not counted — each fails a test; the list filter alone is not a guard, the claim is).
- **CMS E2E (1):** a category, then a weekly digest (address from the title, date required) published and listed.
- **App E2E (1):** Home → Current affairs → Weekly → the digest with summary and source.
- Screens checked: CMS editor, app Home tiles (moved up under the current course), list and article page.
- Local only (KI-036): the CMS suite's database seed crashed once (0xC0000409) before any test; it passed on re-run.

### Added with the email box (T-059, D-062)
- **API (2 integration tests):** the box (plain text and HTML: bold iPhone line, linked website) is under the
  sign-up verification, welcome and course-update emails, not under the password reset code (no HTML at all); in
  the student's language; none when switched off in the CMS. Mutation-checked (5: box on security codes, none on
  verification, none on notifications, switch ignored, always English — each fails a test).
- **App E2E (extended):** sign-up shows "Important: check your email". **CMS E2E (extended):** the box card.
- Screens checked: the real verification email in Mailpit (HTML), the verify screen, the CMS card (text boxes made
  taller after the check).

### Added with iPhone buyers (T-058, D-061)
- **API (4 integration tests):** the welcome email goes once to each new student in their language with the
  website (not staff, not accounts older than 3 days); CMS text and switch followed (off → those who joined then are
  never sent one); retried after an email failure (not before 10 minutes); an iPhone session opening a paid course
  without access is noted with its device (visits once per 30 minutes) — not Android (even claiming iOS in the
  header), not signed out, not a student with access; staff see it, get the filled-in email, are refused without
  `{link}`, send it (link in the email, audit, moved to "emailed"), see "has access now" after a purchase; refused
  without `interests:manage`; erasure removes interest, account emails, push tokens, notifications, deliveries
  and preferences. Mutation-checked (6 mutations: any device, students with access, push tokens kept, old
  accounts, welcome while off, staff welcomed — each fails a test).
- **CMS E2E (1):** an iPhone sign-in opens a paid course → listed with "iPhone 15" → Email link → sent → "Emailed".
- Screens checked: the CMS list and email dialog; the iPhone locked course (requests rewritten to iOS in a
  throwaway browser run).

### Added with event notifications (Phase 12b, T-056, D-060)
- **API (6 integration tests):** a Khalti payment tells the student once in the app and by push (repeated returns
  add nothing) and queues no email; results released by staff reach each student once — not one who already
  opened the result; an immediate result seen on submitting is not announced, a written answer is once graded, an
  after-close result once the test closes; reminders 1 day and 1 hour before to students with Premium access only
  (not one without access, not one who joined free), each once, none after opening, a moved test reminded again,
  drafts never; at short notice only the nearest goes (the other recorded as not sent); switched off → none; the
  same time twice refused; course updates: refused with no students, too-long title refused, sent to the course's
  students only, the student's "no email" choice kept, history and audit, refused for staff without
  `courses:notify` and for students. Mutation-checked (6 mutations: seen-on-screen, Premium rule, nearest-only,
  purchase email, manual release, opening time in the key — each fails a test).
- **CMS E2E (1 new, 1 extended):** Notify students — empty refused, send with confirmation, listed with its count;
  System settings → Exam reminders: defaults shown, the same time twice refused, a third time saved.
- **App E2E (extended):** a course update from staff appears in Notifications; purchases offer push only.
- Screens checked (CMS course tab and reminders card, app list and settings); fixed: "1 days" in the reminder unit.
- Local only (KI-036): in one full CMS run the test servers stopped during the grading spec (the specs after it could
  not connect); those 12 tests pass when run again. App suite 33/33, website 5/5.

### Added with notices and notifications (Phase 12a, T-055, D-060)
- **API (5 integration tests):** writers draft and submit, only publishers publish or change a live notice, audit,
  rich text checked; the Notice tab shows live notices pinned first — not drafts, scheduled (until their time) or
  expired ones — and the badge counts notices published since the student joined / last opened the tab; staff and
  students kept out of each other's endpoints; a notice with "notify" goes once by push and email following each
  student's choices (without it nothing is sent, a second run sends nothing twice), a device Expo no longer knows is
  switched off; push retried when Expo is down; inbox, unread count, mark read, preferences and push tokens
  validated. Mutation-checked.
- **App E2E (2):** the Notice tab with "2 new", pinned first, badge cleared on opening, notice page; the empty
  notifications list; push / email choices kept after a reload; "push not available" shown on the web build.
- **CMS E2E (1):** an empty notice refused; write, pin, tick push / email, create, publish; list shows pinned,
  kind, "When live" and Published.
- Screens checked; fixed: the "Official notice" chip showed the Premium lock icon, and switch thumbs were teal.
- The new specs pushed both suites past the API's security limits, which a whole suite meets from one IP: the
  sixth CMS sign-in of one editor (5 per account per 15 minutes) and the eleventh app sign-up (10 per IP per hour)
  were refused, so the refunds (CMS) and reconnect (app) specs failed in CI. The limits stay as they are: the CMS
  notices spec signs in with a third seeded editor, and the app notices spec uses a student made by the seed
  (`E2E_STUDENT_EMAIL`) instead of signing up.
- Local only (KI-036): with two suites running at the same time, servers crashed mid-run (certificates, questions);
  each passes when run again on its own. Website suite 5/5.

### Added with referrals (Phase 11 part 4b, T-054, D-058, D-059)
- **API (6 integration tests):** code made once and stable; unknown code refused at sign-up (no account made), any
  case accepted; first purchase gets the friend discount, paid → referral rewarded and the referrer's one-use coupon;
  second purchase no discount; reward usable only by its owner; audit; staff list; bigger of coupon / referral (tie →
  referral, coupon left), invalid coupon still explained, a coupon win leaves the referral unused; full refund turns
  off an unused reward, a used one stays; programme off ignores codes, config flag, sale-price switch; CMS refuses
  switching on without discounts. Mutation-checked (bigger-wins, owner-only, used-reward rule).
- **Website E2E (1):** `/r/<code>` → sign-up with the code filled in → email code → checkout shows the referral
  discount → Khalti → the referrer's reward appears. Suites start with the programme on through `E2E_SETTINGS`
  (seeded test values, website and app suites only).
- **App E2E (1):** Profile → Invite friends (code, both offers, no rewards yet); a sign-up link fills the code in.
- **CMS E2E (extended):** the referral card refuses switching on without the percentage.
- Screens checked; fixed: the CMS card's amount fields overflowed the card.
- Local only (KI-036): the CMS E2E web server stopped after the monitoring spec twice; the affected specs pass alone (8/8).

### Added with the website (Phase 11 part 4a, T-053)
- **Unit (6)** as above.
- **E2E (4):** course page with CMS content and price, switch to Nepali (Devanagari digits, Nepali title) and back;
  share link signed out → create account → email code from Mailpit → back at checkout with the coupon applied →
  Khalti → API-verified return → Payment successful → receipt PDF → My account (Paid, receipt) → course page says
  you have access; sign out → wrong password explained (email kept — a bug the test found: React reset the form) →
  sign in; certificate number check. With 60-second tokens the run made 26 refreshes and the API recorded no
  refresh-token reuse.
- Found and fixed while testing: the API config path (`/app/config`); Next's on-disk fetch cache serving a previous
  run's catalog (cleared when the E2E server starts); the email field emptied after a failed sign-in.
- Screens checked at desktop and phone width, English and Nepali.

### Added with receipts and refunds (Phase 11 part 3, T-052, D-057)
- **Receipt PDF unit (1):** one A4 page titled with kind and number — receipt, tax invoice, Rs 0 order, and no
  business details yet (this case found a crash: pdfkit fails on empty metadata; fixed).
- **API (5 integration tests):** numbers run in order with the fiscal year; the student's signed link gives the PDF,
  while someone else's order, a changed signature, a longer expiry and an expired link give 404; the receipt email
  carries the PDF; numbering follows the CMS setting; tax invoice with the seller's PAN when VAT-registered;
  receipts cannot be changed or deleted (database trigger) but delivery status can; Rs 0 orders get receipts;
  refunds: more than paid refused, open requests count, partial approval keeps access, the rest removes it (order
  refunded, entitlement revoked, student sees Refunded), sent with reference, audit; rejection keeps access and
  frees the amount; approvers only; unpaid orders refused. Mutation-checked (access not removed, open requests not
  counted, expiry not checked → each fails a test).
- **Admin E2E (1):** paid order shows its receipt number → request a full refund → Refunds queue → approve (access
  removed, order Refunded) → mark as refunded with the reference.
- **Student E2E (extended):** Purchases → receipt button → the link returns a PDF.
- Receipt PDFs checked as images (receipt; tax invoice with coupon and VAT 13% inclusive: Rs 2,700 = Rs 2,389.38 +
  Rs 310.62).

### Added with coupons and VAT (Phase 11 part 2b, T-051, D-055, D-056)
- **API (9 integration tests):** coupon management (upper-case codes, duplicate 409, shape rules, switch off, audit,
  permission); checkout applies the server's discount (a client's own discount is ignored; the gateway is asked
  for the discounted total; the order keeps code and discount; an unpaid order is reused only for the same total);
  every refusal reason (not found, off, not started, ended, not applicable, below minimum, sale price — and the
  discount from the sale price when allowed); limits (an unpaid order holds the last use until it runs out; a
  student's own replaced order does not count; per-student limit); 100% and over-price fixed coupons → paid at once
  with Rs 0, access, no payment, audited; chosen plans only; VAT not registered / inclusive (Rs 1,130 contains
  Rs 130) / added on top after the coupon (Rs 1,695 to the gateway); VAT settings refused without PAN and name.
  Mutation-checked: removing the sale-price rule, the use limit or VAT-on-top each fails a test.
- **Admin E2E (2 + 1 extended):** create a coupon for one course, share link, list; a student's order shows the
  coupon and discount; System settings → VAT card refuses registration without the PAN / VAT number.
- **Student E2E (2):** a wrong code is explained, the right one shows the discount and the pay amount, removing it
  restores the price; a share link opened signed out → sign in → checkout with the 100% coupon → Get access →
  access. Screens checked with screenshots.
- KI-036 seen once (the admin E2E web server stopped mid-run); the re-run passed 27/27.

### Added with plans (Phase 11 part 2a, T-050)
- **API (5 integration tests):** staff write, price and publish a plan (duplicate slug 409, sale above price 400,
  audit trail, no access without `plans:manage`); students see it with pricing on Android and none on iOS; a bought
  plan opens its courses' premium content while active and not after it ends; a course the plan covers cannot be
  bought; adding / removing courses and switching to all courses apply to current subscribers at once; renewal
  starts when the current period ends (+60 days for two 30-day purchases); a lifetime plan cannot be rebought; a
  free plan is not sold; "plans only" Premium tests open to plan holders.
- **Admin E2E (1):** create a plan, add a feature, highlight, price, choose a course, publish; list shows it.
- **Student E2E (1):** Profile → Subscription plan → plan card (Recommended, features, course, sale price) → checkout
  → Khalti → paid → the covered course is open → "Your plan · until …" → Renew shows the renewal note → Purchases.
- KI-036 seen once (Vitest worker exit 0xC0000409 in `content-admin`); the re-run passed 241/241.

### Added with the Android payment return fix (KI-042)
- **API unit (3):** development callback address = the address the device reached the API on (emulator 10.0.2.2,
  phone on Wi-Fi), never a malformed one; any other environment always uses the configured address; the app's return
  link is accepted only when allowed (configured, or Expo Go's in development) — never an arbitrary address. Payment
  integration tests and the purchase / orders browser specs re-run green.

### Added with the free-enrolment access fix (D-053, KI-043)
- **API (1 new + 1 updated integration test):** a free course sharing a subject with a paid course no longer unlocks
  the paid course's premium lessons or PDF (mutation-checked: the old rule fails both tests); a free enrolment opens
  free lessons only; a staff grant (or purchase) unlocks premium ones. All suites re-run green.

### Added with course purchase (Phase 11 part 1, T-049)
- **Gateway unit (5):** eSewa form signing (field order, rupee amounts), eSewa's **own published signed success
  response** accepted and altered / unsigned / garbage ones rejected, status-check mapping (COMPLETE, NOT_FOUND,
  PENDING, AMBIGUOUS, CANCELED, FULL_REFUND, outage); Khalti initiate (paisa, server key, return address) and lookup
  mapping (only Completed completes).
- **API (8 integration tests, gateways answered by a test stand-in at the HTTP boundary):** Playbook §11.11 —
  success (Khalti, eSewa), failure / cancellation / expiry (no access, try again), **duplicate and repeated
  callbacks** (one access, events kept), **invalid signature** (rejected), **invalid amount** (no access, flagged —
  mutation-checked), **expired payment** and unpaid orders (worker), **client disconnect after payment** (order view
  and worker settle it), **duplicate enrollment** (two payments → one access, second flagged — mutation-checked;
  D-052 refuses rebuying); also: price from the server only (client amounts ignored), channels (iOS, Android
  web-only), free courses, gateway switched off, gateway down (502, recorded), forged return addresses, privacy of
  orders, staff permissions, staff re-check (audited), revoking paid access keeps the order.
- **Real test gateways (manual script, session 20):** eSewa accepted our signed form and rejected a bad signature;
  eSewa status API and Khalti initiate / lookup answered through our gateway code. Completing a payment on their own
  pages is a manual owner check (KI-041).
- **Browser E2E (student app, 1 new spec / 2 tests; local gateway stand-in):** Buy → checkout (Rs 1,500, both
  gateways) → Khalti → cancel → "Payment not completed" → Try again → eSewa (our signed hand-off page) → pay →
  "Payment successful" → access → Purchases lists it. **CMS (1):** a student paid and never came back → Orders →
  "Check with Khalti" → paid, access given, gateway messages shown.

### Added with exam hardening (§10, T-048)
- **API (3 integration tests):** a save that arrives after a newer one is skipped (mutation-checked), newer saves and
  clearing still apply, older apps without `clientSavedAt` always apply; four submits and a save arriving together
  score once and the stored answer is the scored one, closed afterwards, nothing left for the worker; a submit after
  the time is up counts at the deadline with the answers saved in time; a new start after a finished attempt makes a
  new attempt. (Simultaneous starts, repeated submits, grace and the worker were already covered.)
- **Browser E2E (student app, 1 new):** answer online → connection drops → answer offline ("Offline — your answers
  are kept on this phone") → close the app → reopen online → "Continue test" → answers sent → score 2 of 2. It failed
  before the KI-039 fix.
- **CMS:** the certificates spec failed in CI (KI-040): revoking while a search was still loading left the list on
  the old state. The spec now delivers that search response late on purpose, so the race happens every run; it fails
  without the fix and passes with it.

### Added with the mistake notebook (§10 part 3c)
- **Domain (unit, 5):** practice feedback (correct / partial / wrong / skipped, written answers self-reviewed); what
  counts as a mistake (D-050); first mistake → N correct in a row masters it, a wrong one resets the run, N = 1; a
  mastered or removed question returns on a new mistake with its history; a mistake older than the latest revision
  only counts in the history.
- **API (5 integration tests):** practice answers scored on the server (wrong and partial kept, correct and
  unanswered not; written answers and mismatched types refused); notebook list and summary; revision to mastery with
  the CMS N (2, then 1), reset on a wrong answer, partial is not correct, 404 once mastered or never answered,
  removal, return with history; test mistakes **only after results are released** (mutation-checked), never skipped
  answers, not twice, history across tests; premium answers locked without access unless a released test showed the
  solution (mutation-checked); self-graded written answers join once completed and are self-reviewed; sign-in
  required; bad cursor refused; erasure removes the notebook.
- **Browser E2E (student app, 2 new):** wrong practice answers → "Saved to your mistake notebook."; Profile →
  Mistake notebook → 2 to revise → correct twice in a row → mastered → remove the other → 0 to revise · 1 mastered.
- **Screenshots reviewed** (notebook, revision answer, mastered, practice note, Nepali dark). Fixed "1 marks" on
  practice questions.

### Added with certificates (§10 part 3b)
- **Domain (unit, 4):** certificate earned at exactly the share (66.7 % vs 66 / 67 %, empty course never); 8 bytes →
  12 unambiguous characters; printed in groups of four; read back ignoring case, spaces, dashes and O/0, I/L/1.
- **API PDF (unit, 2):** one A4 landscape page in English and Nepali, with and without the QR code; no signatories /
  no intro. Rendered PDFs checked visually (Devanagari conjuncts, reph and vowel signs shape correctly).
- **API (4 integration tests):** issued automatically at the template share, once; frozen wording and name after
  template / name edits; public verification however the number is typed; PDF served; unknown numbers 404; no
  certificate without course access (mutation-checked on the course page), inactive template or no template; lessons
  finished earlier count once access / the template arrives; revoke (reason required, 409 twice) → verifies as
  revoked, PDF 410 (mutation-checked), not issued again → reinstate; audit trail; template validation; course editors
  pick templates but cannot write them; staff scopes on the issued list, revoking and assigning; sample PDF;
  verification URL setting; erasure removes certificates. Existing catalog / progress checks updated for the new
  fields.
- **API (1 integration test):** the default per-IP limit (300 a minute, `RATE_LIMIT_DEFAULT_PER_MINUTE`, KI-038):
  the 301st request is refused, another IP is not.
- **Browser E2E (CMS, 2 new):** write a template (validation), sample PDF download, choose it on the course's
  Certificate tab; a student finishing the course receives it; search by number, revoke with a reason, reinstate.
- **Browser E2E (student app, 2 new):** enrol → course page shows the rule and 0 of 2 lessons → finishing a lesson
  shows "Certificate earned!" → Certificates lists it → Open certificate requests the PDF; course page and Profile
  lead to it.
- **E2E harness:** a second seeded editor account and a reused editor token keep the suites under the staff sign-in
  limit; E2E runs raise the default per-IP limit (all traffic comes from 127.0.0.1).
- **Screenshots reviewed** (CMS template, course tab, revoke dialog, issued list; app course page, dialog, list, Nepali
  dark). Fixed: number and date wrapping in the CMS list; the course hero back arrow in dark mode; Nepali wording.

### Added with daily challenge, streaks and leaderboards (§10 part 3a)
- **Domain (unit):** streak advance (same day, next day, gap, older day, month/year boundary), streak shown as 0 after
  a missed day, leaderboard names (first + initial, Devanagari, single name, full, none), competition ranking.
- **API (4 integration tests):** today's challenge; streak 4 → 5; same day again unchanged; past challenge is
  practice and never extends a streak (mutation-checked); future challenge not open; practice off → closed; lapsed
  streak shows 0; erasure removes the streak; ranks from official attempts with ties (1, 2, 2, 4), names per
  setting (first + initial / full / none), rank on the result, hidden before release, practice excluded, 404 without
  a leaderboard. Existing attempt / grading / builder suites still pass.
- **App unit:** Nepal day at midnight boundary; route gate (no decision before the account loads — KI-037).
- **Browser E2E (student app, 2 new):** Home card → today's challenge → Rank 1 of 1 → leaderboard → 1-day streak and
  "Done for today"; past challenge → practice note → no rank, streak unchanged. KI-037 reproduction: 2/5 failures
  before the fix, 8/8 passes after (16 reloads).
- **Screenshots reviewed** (light, Nepali dark): Home card before/after, exam counter, result rank, leaderboard.
  Fixed: "1 questions", the 5-minute warning shown for the whole of a 5-minute test.

### Added with grading and results (§10 part 2)
- **API (4 integration tests):** queue → grade (over the maximum refused) → corrected → totals and pass/fail → hidden
  until released → release needs `assessments:publish` → student sees score and comment; releasing twice changes
  nothing; audit entries; auto-scored, unanswered and running attempts cannot be graded; permissions and staff
  scopes (mutation-checked: removing the attempt scope check fails the test); statistics from official attempts.
- **Regression:** a scoped editor searching assessments sees only their scope (fails without the KI-035 fix).
- **Browser E2E (admin):** Grading → invalid marks message → marks + comment → queue empty → Results (Completed,
  4 / 5) → Release results → student result released with the comment → attempt page shows who marked it.
- **Browser E2E (student app):** a written answer in an instructor-graded test → "teachers will mark" → graded via
  the CMS API → 4/5 and "Comment from your teacher" in the review.
- **Screenshots reviewed:** Grading, Results, attempt page.

### Added with the attempt engine (§10 part 1)
- **API (10 integration tests):** start → autosave (newest wins) → resume → submit with negative marking and partial
  credit (exact score); no answer key, explanation or model answer in the running attempt (rule 5); wrong answer
  types and foreign questions refused; double submit harmless; saves after submit refused; five simultaneous starts
  create one attempt; grace period accepts a late save, later saves submit automatically with the deadline as the
  submit time; the worker finishes abandoned attempts; window not open / closed, late-start rule both ways, attempt
  limit; Premium access rule (course, category, parent category, subject, any course, plans only); results hidden
  until after close / manual release; written answers self-graded (marks capped) → pass/fail; official attempt
  first/best; random sections pick distinct questions; an edit after start does not change the attempt (version
  pinned); other students get 404; verification required; erasure removes attempts. **Mutation-checked:** sending
  answers during the attempt, opening Premium to all, or never expiring each makes tests fail.
- **Domain (unit):** window state, deadline with late start (all four cases), result release, official attempt.
- **Browser E2E (student app, 3 new):** subject Tests tab → rules → exam: answer, mark for review, **reload resumes
  every answer**, palette states, confirm counts, submit → 1.5/5 (−0.5 + 1 + 1) and Passed → review with explanation
  → attempt listed; weekly exam from "Tests for your exam" waits for its window to close; a 1-minute test is
  **submitted by the app when time runs out**. Practice questions still pass after sharing their answer inputs.
- **Browser E2E (admin):** changing "Official attempt" in Settings → Assessment defaults prefills new assessments.
- **Screenshots reviewed** (light, dark, Nepali): tests tab, test page, exam, palette, submit, result, review, waiting
  result, CMS editor and settings. Fixed: "1 marks" (now "Marks 1"), "5 minutes left" shown for the whole last five
  minutes (now "Less than 5 minutes left"), truncated option labels in the settings card.

### Added with Sentry in the app and admin (T-042)
- **Browser E2E (admin + app):** the test servers use a fake Sentry host; a real uncaught error reaches it tagged
  with the service, and the email in the query string, typed email and password, and console output are absent.
  Mutation-checked: without the scrubber and breadcrumb blocking, both tests fail (the query-string email leaks).
- **Unit:** admin and app scrubbers keep only the page path (and device context in the app); admin monitoring is off
  without a DSN.
- **Google (manual):** Google accepts the owner's new web client with `http://localhost:8081` (sign-in page shown)
  and refuses an unregistered address.

### Added with monitoring and analytics (T-042)
- **API (Sentry):** a local stand-in for Sentry receives the real SDK's envelopes. Unexpected errors arrive with the
  request id, route pattern, job name and environment; deliberate `AppError`s and 4xx do not; the password, bearer
  token, cookie, query string and email of the failing request are absent. Scrubber unit test; nothing is sent
  without a DSN. Analytics pseudonym: stable, different per account, contains no id, email or name.
- **App unit:** screen names by route pattern; analytics scrubber drops URLs, referrers and person properties.
- **Browser E2E:** the test build sends analytics to a fake host, intercepted: `logged_in`, `$identify` with the API's
  pseudonym, `$screen` names (`/login`, `/onboarding`, `/`, `/search`), `search_performed` with a count only; no
  name, email, account id, search text, password or URL properties anywhere in the payload (the URL check failed
  before the scrubber was added). The real PostHog key and Google client id are absent from the test build.
- **Manual:** a test error was sent to the real Sentry project with `cli monitoring-test` (owner to confirm it
  arrived — the provided token cannot read issues). Google sign-in: the button appears with the web client id;
  Google answers `redirect_uri_mismatch` for an unregistered address (the app returns to its own origin).

### Added with student learning, part 2 (Phase 9)
- **API:** practice questions — free answers sent, locked premium answers absent from the whole response (checked
  for the model-answer text; forcing answers into locked questions makes 2 tests fail), unlocked after access is
  granted, paging and chapter / topic filters, subject outside the course and drafts → 404, verification required;
  bookmarks (save twice, remove, unpublished hidden, erased with the account); search (courses, lessons, questions;
  premium bodies and model answers absent, drafts excluded, 1-letter query refused); `splitQuestion` for all 7 types (unit).
- **App unit:** practice feedback (single / multiple / match / blank / numeric / written), numbered blanks, BS ↔ AD
  date of birth.
- **Browser E2E (student app):** subject → Questions → wrong answer → explanation → Try again → correct; Premium
  answer locked and absent from every `/questions` response; report a question; save; search finds the lesson and
  the question; Saved lists it; edit profile (name, gender) shows on Profile; delete account → scheduled BS date →
  Keep my account.
- **Screenshots reviewed** (light, dark, Nepali): practice, report sheet, search, Saved, edit profile, password,
  devices, deletion. Fixed: browser focus ring drawn over the design's focus border on web inputs.

### Added with the YouTube fix
- Reproduced error 153 without a Referer and normal playback with one, in Chromium and on the Android emulator
  (WebView). Browser E2E now checks the YouTube iframe's referrer policy; unit tests cover the emulator API address.

### Added with student learning, part 1 (Phase 9)
- **API:** progress positions and permanent completion (mutation-checked), same access rules as opening the item
  (locked premium refused), invalid inputs and wrong course refused, outline progress, Continue (latest unfinished,
  course context, skips unpublished items), finished / total per course; PDF reader page CSP, framing and file
  allow-list (path traversal and unlisted files → 404).
- **Browser E2E (student app):** catalog for my exam with prices, paid course shows price and no Enrol, free course
  Enrol → access; outline → note (heading, bold, list) → Mark as finished → Next lesson → PDF rendered by pdf.js in
  the reader (3 pages, page indicator, watermark notice) → outline shows Done; video embed URL; Home current course
  33 % and Continue reopens the PDF.
- **Screenshots reviewed** (light, dark, Nepali). Fixed: PDF not recorded as started until scrolled (Continue missing),
  Nepali prices with Latin digits in Chromium (`formatNpr` now converts digits itself), missing chapter chevron,
  oval back button on the course page.

### Added with the student app foundation (Phase 8)
- **API:** `/me/target-posts` (order, path, replace, empty), refused unpublished/unknown/duplicate/too many, hidden
  once an ancestor is unpublished, students only; `childCount` in the public category list; erasure clears target
  posts (mutation-checked); `app.storeLinks` https-only and published in `/app/config`.
- **App unit:** single-flight refresh mutation-checked (3 refreshes without it).
- **Browser E2E:** sign-up validation → email code (wrong code refused, real code from Mailpit) → onboarding with
  CMS categories (search, choose) → Home with today's BS date; Nepali + dark applied and kept after reload; log out,
  wrong password refused, log in; forgot password → code → new password → log in.
- **Screenshots reviewed** (light, dark, Nepali, tablet). Defects found and fixed: verify skipped after sign-up and
  “Continue” stuck after verifying (navigation raced the route guards), stretched category chip row, clipped tab
  labels (Nepali vowel signs cut off), header not centred on tablets.

### Added with the assessment builder
- **API:** fixed + random sections; readiness problems (no sections, unpublished question, pool too small) and
  exact totals with per-question and section marks; publish refused until ready (mutation-checked); question in a
  live assessment cannot be deleted; mixed-marks warning and min/max totals; written answers need a grading mode;
  pass marks above total; window / after-close / daily-challenge validation; one daily challenge per day (409);
  chapter must belong to the subject; broken structures rejected; review workflow; staff scopes; audit; defaults
  endpoint.
- **Browser E2E:** quiz with unchosen scoring refused, created, publish refused while not ready, questions added with
  the picker and a marks override, random section shortage reported then removed, ready (2 questions · 5 marks),
  published, list row.
- Note: one full local run printed `145 passed (151)` with no failure listed; two forced re-runs and CI passed 151/151.

### Added with the Excel import
- **API:** the template's 8 example rows (all 7 types + passage) preview clean and import as drafts with topic, PYQ
  stage, paper, tags and passage resolved; nothing saved before confirm; confirm twice refused; re-upload warns about
  duplicates; 8 kinds of row problems reported with the exact column (duplicate ref, unknown subject / category /
  paper / chapter / passage, disabled type, bad answer); only ready rows imported; unreadable file and missing sheet
  refused; only the uploader can confirm; a topic deleted after preview blocks the confirm (mutation-checked);
  scoped editors only match their subjects; permission required.
- **Browser E2E:** download the template from the app, fill it with ExcelJS, upload, see the problem row and the
  ready row, filter, import, find the draft in the Question bank.

### Added with the dynamic admin audit
- **Bug caught by CI:** concurrent free-enrol taps could create two entitlements — the request that waited on the
  lock checked with an earlier timestamp than the new row's start. Fixed (any active, unexpired access counts) with a
  deterministic regression test that fails on the old check.
- **API:** PSC-style tree with sub-group and exam stage; hierarchy rules read from the types table; papers on exam
  stages; type rank/flag changes refused when existing categories would break; in-use types cannot be deleted; off
  types unusable for new categories; only taxonomy managers edit types; disabled question types refused; labels in
  `/app/config`; template download with live lists (questions:edit only).
- **Unit:** template sheets/columns/version, dropdowns and numeric validations survive a write/read round trip, every
  example row (all 7 types) parses into valid content, row parser reports the exact column for each problem.
- **Migration check:** on a scratch database with categories, `exam_node_types` kept every node's type, dropped the
  old enum and rejected an unknown type.
- **Browser E2E:** category types page (add a level, rename an in-use type, exam stage offered under a post);
  template download from the Question bank.

### Added in Phase 7 (question bank admin screens)
- **Unit:** every question type round-trips API → editor → API unchanged; readable validation messages; blank and
  id helpers.
- **Browser E2E:** single-choice question (required-field errors, options, correct answer, Nepali stem, explanation,
  marks, tags, PYQ year), reload persistence, content edits create versions 2 and 3, publish, list filters/search;
  fill-in-the-blank via "Insert blank"; a student report resolved (rejected with a note) in the reports queue.
- **API:** course/question editors can read categories, papers and subject outlines but not change them.
- Bugs caught: list previews showed option text and raw `[[b1]]` placeholders → stem-only previews with ____.

### Added in Phase 7 (question bank backend)
- **Scoring unit tests:** every type; all-or-nothing vs proportional partial credit with half-up rounding; negative
  marks only for wrong answers; skipped vs pending; fill-blank normalisation (case, spacing, Nepali digits,
  case-sensitive blanks); numeric tolerance with floating-point error; zero floor; centimark sums.
- **Schema tests:** valid content per type; answer keys must match options/pairs/blanks; unsafe rich text in options.
- **API:** create all 7 types; invalid keys/marks/topic rejected; new version only on content change; DB refuses
  UPDATE/DELETE of versions; review workflow and live-edit rule; staff scopes; text/tag/type/PYQ filters; private
  images rejected and in-use images protected (incl. course descriptions); student reports (published only, one
  open per student, resolve once, re-report after resolution).

### Added in Phase 6 (content API)
- **Media:** real-type sniffing rejects disguised files; images re-encoded to WebP variants with metadata stripped;
  PDFs forced private; size limits; in-use delete blocked; permission checks.
- **Content admin:** taxonomy tree + papers, subject → chapter → topic → item CRUD, reorder validation, soft delete and
  restore, publish workflow (editors submit for review; publish/schedule/archive need the publish permission; editing
  live content needs it too), scheduling validation, instructor scopes, course pricing permission, audit entries.
- **Catalog/learning:** drafts invisible; scheduled content appears when due; iOS never receives prices, Android only
  when the in-app channel is enabled; premium note bodies / PDF / video never sent without an entitlement
  (`CONTENT_LOCKED`); verification-required setting; revoked/expired grants lose access; archived courses stay visible
  to entitled students; watermarked PDF stream.
- **Free enrolment (D-043):** locked until enrol; access for the course validity; idempotent under 5 concurrent
  taps (one row); paid / closed / unpublished refused; students only; audited. Mutation check: dropping the
  price guard fails the suite.
- **Unit:** access validity (days, fixed date ends at Nepal midnight, lifetime, invalid input), YouTube URL parsing, ISO durations, Bunny signed-embed token, PDF watermark on every page.
- Mutation check: making `hasSubjectAccess` always true fails 3 catalog tests.

### Added in Phase 5
- **API:** staff MFA (forced enrolment by policy, wrong/valid codes, recovery codes single-use + audited, replay of a TOTP step rejected, forged challenge rejected, challenge is not an access token, encrypted secret at rest, disable requires a code, `all_staff` policy); education levels (permission, bilingual create, public active-only ordered list, reorder validation, in-use delete blocked, inactive level rejected on profile, audited); dashboard counts; audit actor names; staff MFA flag.
- **Browser E2E:** wrong password; forced 2FA enrolment with hidden navigation and route redirect; invalid then valid TOTP; 10 recovery codes; sign-in with TOTP; empty code field (regression); session survives reload; create role with a permission; invite staff with that role (pending invitation shown); create bilingual education level; save a setting; audit log shows the actions; sign-out protects routes.

### Bugs caught by verification this phase
- Contrast test: light danger-on-soft and dark primary-hover failed AA → tokens fixed.
- Browser walkthrough: `Button asChild` crashed Roles/Not-found pages (Slot received two children) → fixed + unit test.
- Browser walkthrough: 2FA code field showed the email (reused uncontrolled input) → keyed forms + E2E assertion.
- Browser walkthrough: dashboard query fired during forced 2FA (403) → `can()` mirrors the server rule.

### Added in Phase 6 (admin content screens)
- **Browser E2E (content team, non-Super-Admin):** permission-aware navigation; media upload of an image and a PDF
  (image re-encoded and rendered, PDF private), description saved, type filter; exam categories authority → post with
  emblem from the media picker, auto URL name, allowed child types, publish, delete refused while not empty; papers
  with marks validation, post links and status persisted; subject → chapter → topic → bilingual note (bold, image
  from the media library, Nepali tab) with required-field errors, unsaved-changes guard, reload persistence and
  publishing; video items (YouTube-for-premium warning, Bunny-not-configured error, duration validation), PDF item
  with download flag, scheduling in Nepal time shown in BS; courses (create with auto URL name, details + thumbnail
  + featured, price validation and rupee formatting, sale price, 365-day validity, subject with paper and marks
  validation, exam post and instructor links, publish, values persisted after reload, list shows price/sale/status);
  instructor profile; student course access granted with the course's validity (expiry previewed) and a note, then
  revoked with a required reason.
- **Unit (editor):** real TipTap output for every toolbar feature passes the server's rich-text allow-list after
  `toStoredDoc`; unsafe links and non-library images are dropped (mutation check: without the converter 3 tests
  fail — TipTap emits `orderedList.type` and table `align`). Duration and Nepal-time helpers.
- **API unit:** exception filter — deliberate 5xx `AppError`s log as warnings without stack; unexpected errors log as
  errors and never leak their message.
- **Unit:** multipart uploads in the API client, Button never submits a form unless `type="submit"`, slug/localised
  text/image variant/size helpers.

### Bugs caught by verification in Phase 6
- E2E: the media picker's **Choose** button submitted (and saved) the surrounding form → `Button` now defaults to
  `type="button"` (+ regression test).
- E2E: a form field named `nodeType` shadowed `HTMLFormElement.nodeType` (DOM clobbering), hiding the form from
  Playwright's text/ARIA engines → renamed to `kind`. (Chrome's own accessibility tree was unaffected — checked via CDP.)
- Screenshot review: "1 papers" → pluralised.
- Screenshot review (390 px): subject outline overflowed horizontally and squeezed item titles to nothing → badges
  wrap under the title; page-header actions wrap. Checked `scrollWidth` = viewport on outline, editor and media.
- E2E log review: an expected "Bunny not configured" 503 was logged as an unhandled error with a stack → now a
  warning.
- E2E: staff sign-in rate limit (5 per account / 15 min) hit by per-test sign-ins → content specs share one session.
- Watermark label contained a double space after stripping non-ASCII characters → whitespace collapsed.

## Not yet covered
- Staff content scopes dialog (covered by API tests, not yet by browser E2E); preview-as-student.
- Load testing (Phase 16); content, exams, payments (later phases); student mobile app (Phase 8).
