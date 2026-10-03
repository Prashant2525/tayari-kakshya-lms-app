# Session Handoff

Session date: 2026-10-02 (session 4 — resumed after a VS Code crash)
Current phase: **Phase 6 — content CMS, API layer complete and verified locally**
Current task: Phase 9 part 1 done; PR next (branch `feature/student-learning`)

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

## Session 10 (2026-10-03)
- Owner approved the design (D-047). Built the student app foundation (`apps/mobile`, T-034…T-037), the
  `/me/target-posts` API and `app.storeLinks`, the shared E2E harness and the student browser suite.
- Verified in a phone-sized browser with screenshots; fixed four layout/navigation defects (TEST_STATUS).
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
1. Open the §9 part 1 PR `feature/student-learning` → `main`; confirm CI (`verify`, `admin-e2e`, `mobile-e2e`).
2. §9 part 2: practice questions (student question API with answers withheld when locked), bookmarks, report
   question (API exists), unified search, profile edit, settings (sessions, change password, delete account).
3. When the owner sends keys: Sentry + PostHog (KI-028), Google client ids (KI-029).

## Files changed
- See `CHANGELOG.md` → Phase 6.

## Database / API changes
- Migration `content_catalog`; endpoints in `API_DOCUMENTATION.md` §1b.

## Tests run
- `pnpm format:check && pnpm build && pnpm lint && pnpm typecheck && pnpm test` → all passing, 311 tests; `pnpm --filter @tk/admin e2e` → 19 passing; `pnpm --filter @tk/mobile e2e` → 4 passing.

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
