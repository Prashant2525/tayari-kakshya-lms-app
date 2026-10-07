# Session Handoff

Session date: 2026-10-02 (session 4 — resumed after a VS Code crash)
Current phase: **Phase 6 — content CMS, API layer complete and verified locally**
Current task: Phase 11 part 3 (receipts + refunds) done on `feature/receipts-refunds` (PR into `main`); next part 4
(website checkout for iOS users, referral programme)

## Completed this session
- Recovered the interrupted work from the repository (nothing lost). Verified the uncommitted content API:
  fixed the Bunny token test (independent SHA-256 vector), replaced the watermark test with a content-stream check
  (and fixed a double-space bug it found), removed a brittle PDF-producer assertion.
- Mutation check: forcing `hasSubjectAccess` to return true makes 3 catalog tests fail (access tests are real).
- CI `verify` failed on `aeef198` (media PDF upload returned 500 in CI only). Hardened CI: SeaweedFS started with
  `-volume.max=0 -master.volumeSizeLimitMB=256`, readiness wait on `/dir/assign` (fails with container logs),
  `TEST_LOG_LEVEL=error` so server errors appear in CI output (KI-021).

## Later in the session
- Owner provided Bunny Stream credentials → stored only in the local `.env`; API key verified against the library
  (empty library, so signed playback not yet tested — KI-023). Tests force Bunny/YouTube keys empty.
- Owner answered L6 → D-043 implemented: `POST /courses/:id/enrol`, migration `free_enrolment` (enum value
  `free_enrol`), `access.canEnrol` on course detail, `accessEndsAt` helper in `@tk/domain`.

- Owner uploaded 4 videos to Bunny → checked signed playback: **token authentication is OFF** in the library
  (forged/expired tokens accepted, HLS playlist loads with any Referer). Owner must enable it (KI-023).
- Admin CMS: media library + media picker, exam categories, papers. E2E uses a seeded non-Super-Admin content
  account (`E2E_EDITOR_EMAIL`). Fixed `Button` default submit and a DOM-clobbering field name found by E2E.
- Admin CMS: subjects list + outline and the item editor (TipTap; `toStoredDoc` keeps output inside the server
  allow-list). Content E2E now signs in once (staff login limit 5/15 min). Expected 5xx AppErrors log as warnings.
- Admin CMS: courses (tabs: details, pricing & validity, subjects, exams & instructors; publishing card),
  instructors, course access card on the student page, staff "Limit content access" dialog.

## Session 5 (2026-10-03)
- PR #6 merged by the owner. Owner enabled Bunny embed token auth → verified (forged/expired/unsigned 403);
  CDN token auth still off (KI-023).
- Phase 7 started: scoring engine (D-044: every scoring rule is a CMS choice), question schemas, migration
  `question_bank` (versions immutable by trigger, T-030), question API, reports. Media usage now includes course
  descriptions/passages/question versions (bug fix).
- Reports to the owner end with a **"What you need to do"** checklist (owner request).
- Question bank admin screens + reports queue; taxonomy/subject reads opened to course/question editors (bug fix).

## Session 6 (2026-10-03)
- Owner enabled Bunny CDN token auth + allowed domains → verified against Bunny docs and live (T-031, KI-023
  resolved). Signed embed lifetime cut to 5 min. React Native plan: signed embed in a WebView.
- Owner added the **fully dynamic admin** requirement → `DYNAMIC_ADMIN_AUDIT.md` + D-045. Implemented:
  admin-managed category types (migration converts the enum in place; verified on a scratch DB), question types
  switch, universal import template (D-046) + row parser. Test/E2E resets restore default category types.

## Session 7 (2026-10-03)
- Owner approved the template, the audit and the Bunny setup.
- Excel import built end to end (migration `question_imports`; preview/commit; admin Import page; E2E).
- Note: a stalled `prisma migrate dev` left a dev-DB session holding Prisma's migration lock; terminated the three
  dev-only sessions after identifying them. Run `migrate dev` with `< /dev/null` and a timeout in this shell.

## Session 8 (2026-10-03)
- Assessment builder (migration `assessments`, API, readiness, admin list/editor/sections, E2E). Scoring choices are
  required per assessment; prefill only for D-017 values. Questions in live assessments cannot be deleted.

## Session 9 (2026-10-03)
- PR #8 (Phase 7 builder) merged by the owner. Branch `feature/mobile-foundation` created from `main` (`5bb58e8`).
- Design preview for the student app published as a private claude.ai design canvas (link given to the owner in
  the session report): tokens and components, loading/offline/empty/error/update states, login, OTP verify
  (email or SMS, D-029), target-post onboarding, Home (current course, daily challenge + streak, shortcuts,
  popular courses), course detail on Android (price as a CMS value) and on iOS (no price or purchase UI, D-027),
  subject outline with status chips, note reader (A−/A+, bookmark, watermark notice), video, practice questions
  with a locked model answer, full-screen exam mode, result, Home in Nepali + dark theme with BS dates, profile,
  notices (D-019). All content on the screens is sample data; the app renders CMS data.

## Session 11 (2026-10-03, resumed after a usage-limit interruption)
- PR #9 / #10 merged. Branch `feature/student-learning`. API part committed first (`485f5f7`): progress, Continue,
  self-hosted PDF reader. Then the app: Courses tab, course page, Home current course, subject outline, lessons.
- Verified with 8 browser tests (real API, PDF rendered by pdf.js) and screenshots; four defects fixed (TEST_STATUS).

## Session 20 (2026-10-06)
- PR #21 merged. Owner gave Khalti test keys (labelled "Live" in Khalti's test panel; confirmed sandbox: dev.khalti.com
  accepts them) → only in the git-ignored `.env`. eSewa uses its published UAT merchant (EPAYTEST).
- Owner decided D-052 (no rebuying while access is active; manual grant/revoke stays in CMS → Students).
- Branch `feature/commerce` (T-049). Verified against the **real test gateways**: eSewa accepts our signed form (302
  to its payment page) and rejects a bad signature (ES104); eSewa's status API answers NOT_FOUND for unpaid; Khalti
  initiate returns a pidx + test-pay.khalti.com page, lookup answers Pending. eSewa's published UAT key is
  `8gBm/:&EnhH.1/q` — the docs page shows a stray "(" — proven by reproducing eSewa's own signed success response.
- Not automated: completing a payment on the gateways' own pages — eSewa's UAT login has a reCAPTCHA (not to be
  bypassed) and Khalti's shared test wallet 9800000000 reports "MPIN locked". Manual check below.
- **Manual test purchase (owner):** restart the API (migration `commerce`), run the app on the web
  (`pnpm --filter @tk/mobile dev`, `w`), open a paid course → Buy → Khalti → pay with a Khalti test ID
  (9800000000–9800000005, MPIN 1111, OTP 987654) or eSewa (ID 9711111111, password Nepal@123, OTP 123456) → you
  should land on "Payment successful"; CMS → Orders shows the order with every gateway message.

## Session 19 (2026-10-06)
- PR #20 merged. Owner answered Q25's follow-up → D-051 (test credentials first, all gateway config from `.env`).
- Branch `feature/exam-hardening` (T-048): the new reconnect browser test found KI-039 (offline answers lost when the
  app was closed before reconnecting) — fixed. Late saves can no longer overwrite newer answers.
- §10 is complete. Next: Phase 11 commerce.

## Session 18 (2026-10-06)
- PR #19 merged. Branch `feature/mistake-notebook` (D-050, T-047).
- Design point: a test's mistakes join the notebook only once its results are released — adding them at submit
  would reveal which answers were wrong before release (manual / after-close release).
- Practice answers are now also sent to the API (scored again there); T-041's "not stored" no longer holds.
- Screenshots: fixed "1 marks" on practice questions.

## Session 17 (2026-10-06)
- PR #18 merged. Owner answered the part 3b questions → D-050 (certificates issued automatically; mistake notebook fed
  by tests + practice; wrong or partly correct; leaves after N correct in a row, N in CMS settings, or on removal).
- Branch `feature/certificates` (T-046): certificates only — the notebook is part 3c, a separate PR.
- PDF: pdfkit with the app's Mukta font (copied with its OFL licence to `apps/api/assets/fonts`) shapes Devanagari
  correctly (checked visually: conjuncts, reph, vowel signs). **Deployment:** the API image must include
  `apps/api/assets`.
- Screenshots fixed: certificate number / date wrapping in the CMS list; the course hero back arrow in dark mode;
  Nepali wording uses "कोर्स" like the rest of the app.

## Session 16 (2026-10-06)
- PR #17 merged. Owner shared the design canvas (D-047) from another account as reference; reviewed it and mapped
  what is not built yet to phases (DESIGN_SYSTEM §10). The canvas is a reference, the repository is the truth.
- Owner answered the part 3 questions → D-049 (streak = daily challenge on its day; names first + initial; past
  challenges as practice; certificates for finishing a course). Two of them are CMS settings.
- Branch `feature/daily-challenge`: part 3a (T-045). While screenshotting, found and fixed the onboarding guard race
  (KI-037) — the same symptom seen in session 13 had been blamed on the test script.
- Next: part 3b — certificates (needs certificate wording/signatory details from the owner when the CMS template
  exists) and the mistake notebook (one open rule: when a question leaves the notebook).

## Session 15 (2026-10-06)
- PR #16 merged by the owner. Branch `feature/grading`: §10 part 2 (T-044) — see IMPLEMENTATION_PLAN / TEST_STATUS.
- Found while reading the admin assessment list: the staff-scope filter and the title search were both spread as
  `OR`, so searching replaced the scope (KI-035) — fixed with AND, regression test fails without the fix.
- Totals recalculation moved to `attempt-totals.ts` (shared by student self-grading and staff grading).
- Admin got a read-only rich text view (`RichTextView`) for questions and model answers.

## Session 14 (2026-10-04)
- PR #15 merged. Owner: Google sign-in works on the web; no button on Android (expected — needs an Android OAuth
  client = app identifiers L5 + a development build). Sentry admin check: two test events were accepted (200) by the
  admin project; the owner's console test was probably filtered (environment / ad blocker / inbound filter).
- Owner answered the three attempt-rule questions and asked that each be managed from the admin portal → D-048
  (per assessment, defaults in Settings → Assessment defaults).
- §10 part 1 on `feature/exam-engine`: see IMPLEMENTATION_PLAN and TEST_STATUS. Found and fixed during the work:
  merging two Prisma `OR` filters silently dropped the live filter (now `AND`); exam strings ("1 marks", "5 minutes
  left"); clock offset and auto-submit rewritten to satisfy React's purity rules.

## Session 13b (2026-10-04)
- PR #14 merged. Owner created Sentry projects for the app (React Native) and admin (React), sent their DSNs, a new
  auth token (the old one was pasted again — use the new one) and a **new** Google web client (id + secret). Stored in
  the root `.env`, `apps/mobile/.env` (`EXPO_PUBLIC_SENTRY_DSN`, Google id) and new `apps/admin/.env`
  (`VITE_SENTRY_DSN`); the old Google client id and token were removed from the files.
- Branch `feature/sentry-app-admin`: `@sentry/react` 11.1.0 in the admin, `@sentry/react-native` 7.11.0 (Expo SDK 57
  pin) in the app + Expo config plugin; no user, breadcrumbs, screenshots, replay, tracing; E2E servers use a fake
  Sentry host; mutation-checked. `@sentry/cli` install script disallowed (KI-011).
- Google: Google shows the sign-in page for the new client with `http://localhost:8081` (registered correctly). The
  owner's running Expo still had no Google button — it reads `apps/mobile/.env` only at start.

## Session 13 (2026-10-04)
- PR #13 merged by the owner. Owner sent Sentry (API DSN + auth token), PostHog (project key, US host) and a Google
  OAuth web client (id + secret). Stored only in the git-ignored root `.env` and `apps/mobile/.env` (public values).
  The client secret is not used (the app's Google flow is ID-token only).
- Branch `feature/monitoring-analytics`: Sentry 11 in the API + worker (T-042 — Sentry 11 collects bodies, cookies,
  headers and local variables **by default**, all switched off), `cli monitoring-test`, PostHog in the app with the
  API's `analyticsId` pseudonym, screens by route pattern, 11 events, no flags/surveys/replay, URL properties removed
  (found by reviewing the captured payload). Test/CI builds point PostHog at a fake host and blank Google ids.
- A test error was sent to the owner's Sentry project; the token cannot read issues, so the owner confirms.
- Google: the button shows with the web id; the app sends `redirect_uri` = its own origin → the OAuth client needs
  `http://localhost:8081` as JavaScript origin and redirect URI. The owner's running Expo / API were not restarted
  (they read the env files at start).

## Session 12 (2026-10-03 → 04)
- Owner reported YouTube lessons not playing → fixed (T-040, PR #12, merged) and explained running the app on the
  Android emulator.
- §9 part 2 on `feature/student-learning-2`. API first (`70c4fcf`): migration `bookmarks`, student practice
  questions (answers withheld when locked — mutation-checked), single question, bookmarks, unified search; erasure
  removes bookmarks. App: Questions tab on the subject screen (all 7 types, Check answer / Try again, explanation,
  model answer, passage, Premium lock), report sheet, bookmark buttons, Saved, Search (from Home), Profile links,
  Edit profile (BS date of birth, gender, education level), Change / Set password, Signed-in devices, Delete
  account (confirm → scheduled date → Keep my account). T-041 records the practice-check rules.
- Verified: 4 new browser tests (12 in the student suite) + screenshots in light, dark and Nepali. Fixed: web
  inputs drew the browser's square focus ring next to the design's focus border (`noFocusRing`). `.prettierignore`
  now skips the E2E web build output so `format:check` passes after a local E2E run.

## Session 10 (2026-10-03)
- Owner approved the design (D-047). Built the student app foundation (`apps/mobile`, T-034…T-037), the
  `/me/target-posts` API and `app.storeLinks`, the shared E2E harness and the student browser suite.
- Verified in a phone-sized browser with screenshots; fixed four layout/navigation defects (TEST_STATUS).
- Android emulator: start it in Android Studio (Device Manager), set `ANDROID_HOME` once, then
  `pnpm --filter @tk/mobile android`. The script uses `--localhost` (adb reverse, no firewall) and
  `--dns-result-order=ipv4first` because Metro otherwise listens on IPv6 `::1` only and `adb reverse` reaches
  IPv4 — Expo Go then fails with "Failed to download remote update". The app calls the API at `10.0.2.2:4000`.
  If `adb` hangs (`adb devices` never returns), end the adb process and run `adb start-server`.
- Run the app: `pnpm infra:up`, API on :4000, then `pnpm --filter @tk/mobile dev` (`w` = web, `a` = Android).
  No `apps/mobile/.env` is needed in development: the app calls port 4000 on the computer running Expo (browser →
  127.0.0.1, Expo Go / emulator → the dev server's network address). With `APP_ENV=development` the API accepts any
  `http://localhost:<port>` origin, so no CORS edits are needed locally; a phone needs port 4000 allowed in the
  Windows firewall.
- Owner report: sign-up in the browser failed with "Could not reach the server" — `apps/mobile/.env` held the
  emulator-only address (from my instructions) and CORS lacked :8081. Fixed by automatic dev address detection
  (`src/lib/dev-api.ts`, unit-tested). Second report: CORS still blocked :8081 — the running API had an old
  `CORS_ALLOWED_ORIGINS` from its terminal environment (an identical fresh process allowed it). Fixed for good with a
  development-only rule (`isAllowedOrigin`, unit-tested; staging/production use the list only). Also: `localhost`
  can resolve to IPv6 `::1` while the API listens on IPv4, so the web dev app calls `127.0.0.1`. Verified against the
  owner's running servers: `/app/config` 200, register preflight allowed, no failed requests.

## Decisions taken during implementation
- T-020 resolved (SeaweedFS), T-025 (API-validated uploads), T-026 (live-edit rule), T-027 (archived courses stay
  visible to entitled students), T-028 (instructor scopes). See `DECISIONS.md`.

## In progress / unfinished
- Nothing partially implemented. Admin screens for Phase 6 not started.

## Exact next steps
0f. 2026-10-07 (Phase 12a): PR #29 merged. Owner answered the Phase 12 questions (D-060). `feature/notices` (T-055):
   notices + notification pipeline (`NotificationsService.notify()` → in-app row + outbox; worker job
   `notifications`; Expo push via `PushClient`, fake in tests). Next: **12b** — use `notify()` for (1) purchase paid
   (category `purchase`, link order, in `settle()` after commit), (2) results released (manual release, after-close
   by the worker, grading release; add `assessments.results_notified_at` to send once), (3) exam reminders: setting
   `notifications.examReminders` (minutes before, default 1440 and 60) in the SETTINGS registry, worker sends them to
   students who can take the test (course / subject / exam-node scope), keyed by assessment + offset + opens_at so a
   moved test is reminded again, (4) CMS "Notify students" on a course page (course_update, enrolled students).
   Then 12c articles, 12d static pages / FAQs / contact options / banners (DRAFT legal texts, D-038).
0e. 2026-10-07 (later): PR #27 and #28 merged. Part 4b on `feature/referrals` (T-054, D-058, D-059) completes
   Phase 11. Next: Phase 12 (§12) — articles with BS dates and quizzes, notices with audiences, notification pipeline
   (in-app, Expo push, email) with preferences, banners / home sections, FAQs, contact options, static pages
   (legal texts: the owner supplies or approves them, D-038 — never write them as final). Ask before inventing any
   rule (e.g. which notices are pushed, quiet hours).
0d. 2026-10-07: PR #26 merged. Part 4a on `feature/website` (T-053): `apps/web` Next.js website (BFF, HttpOnly
   cookies, single-use refresh), web-e2e CI job. Owner answered the referral questions (D-058). Next: part 4b —
   referrals: per-student code (`referral_codes`), link `/r/<code>` or `?ref=` at sign-up, friend's first-purchase
   discount and the referrer's reward coupon from CMS settings (`referrals.rules`), reward issued in the payment
   transaction, switched off on a full refund when unused; CMS Referrals page; app Profile → Invite friends.
0c. 2026-10-06 (evening): PR #25 merged. Part 3 on `feature/receipts-refunds` (T-052, D-057): receipts issued with
   payment (numbered per fiscal year, immutable, PDF via signed link, emailed + worker retry), refunds (request →
   approve/reject → sent with reference; full refund removes access). KI-045: no credit notes yet (needed only once
   VAT-registered). Next: part 4 — Next.js website (course pages, sign-in, checkout for iOS users per D-027, receipts,
   legal pages, certificate verification, app links for share links KI-044) and referral programme (ask the
   owner for the referral reward rules before building).
0b. 2026-10-06 (later): PR #23 and #24 merged. Part 2b on `feature/coupons-vat` (T-051): coupons (CMS Sales →
   Coupons, checkout box, share links resumed after sign-in, Rs 0 orders per D-056), VAT card in System settings
   (D-055), `POST /orders/quote`. Next: part 3 — receipts with numbering per BS fiscal year (prefix and reset are CMS
   settings, D-026), PDF receipt using `commerce.tax` details, refund workflow (staff request → approve → processed,
   never deleting records). Ask the owner before inventing receipt wording or refund rules.
0. 2026-10-06: PR #22 merged. PR #23 (Android eSewa, KI-042) green — owner merges it, restarts the API, retries eSewa
   on the emulator. Plans (T-050) on `feature/plans-coupons`, built on top of #23: CMS Sales → Plans, app Profile →
   Subscription plan, plan checkout and renewal. Next: part 2b — coupons (D-025: CMS CRUD, limits, redemptions,
   server-side at checkout, `allowOnSale` default off per D-054; a 100% coupon makes the total 0 → the orders CHECK
   `total > 0` must change) and VAT settings `commerce.tax` (owner, 2026-10-06: details later, must be editable in
   the CMS without code changes; default: not VAT-registered, rate 13%, prices VAT-inclusive; PAN / VAT no.,
   business name and address fields) with a tax snapshot per order; part 3 invoices use it.
1. Owner reviews and merges the Phase 11 part 1 PR (`feature/commerce` → `main`); CI must be green; owner tries a
   test purchase (above).
2. Phase 11 part 2: plans (subscriptions: contents, validity — D-023) and coupons (D-025) — CMS + checkout.
3. Part 3 needs the owner's VAT / invoice / refund details (D-026): VAT registered? rate? inclusive? PAN/VAT no.?
3. Google Android/iOS clients after the app identifiers (L5, KI-029); Sentry source maps with the first EAS build.

## Files changed
- See `CHANGELOG.md` → Phase 6.

## Database / API changes
- Migration `content_catalog`; endpoints in `API_DOCUMENTATION.md` §1b.

## Tests run
- `pnpm format:check && pnpm build && pnpm lint && pnpm typecheck && pnpm test` → all passing, 384 tests; `pnpm --filter @tk/admin e2e` → 21 passing; `pnpm --filter @tk/mobile e2e` → 20 passing.

## Known issues / blockers
- KI-021 (CI-only media failure — fix pending CI confirmation), KI-022 (per-request watermark cost). No blockers.

## Credentials still required
- Cloudflare R2 before staging. (Bunny provided — local `.env`.)

## Questions for the owner
- None open. **Action:** enable Bunny Token Authentication (KI-023).

## Local environment notes
- Dev DB has Super Admin `owner@example.test` (dev-only password `Dev-only password 1`, 2FA reset — enrol on first sign-in).
- SeaweedFS S3 on :8333 (dev keys in `infra/docker/seaweedfs/s3.json`). Public media is served by the API proxy in dev.
- If Docker isn't running after a reboot, start Docker Desktop, then `pnpm infra:up`.
- Git Bash mangles `/paths` in docker args — prefix with `MSYS_NO_PATHCONV=1`.
- If the Bash heredoc tool fails on long scripts, write the script to the scratchpad and run it.
