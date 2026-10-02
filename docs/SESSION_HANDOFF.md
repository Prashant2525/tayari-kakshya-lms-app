# Session Handoff

Session date: 2026-10-02 (session 4 — resumed after a VS Code crash)
Current phase: **Phase 6 — content CMS, API layer complete and verified locally**
Current task: Phase 7 — question bank done (API + admin + E2E); import next (branch `feature/question-bank`)

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

## Decisions taken during implementation
- T-020 resolved (SeaweedFS), T-025 (API-validated uploads), T-026 (live-edit rule), T-027 (archived courses stay
  visible to entitled students), T-028 (instructor scopes). See `DECISIONS.md`.

## In progress / unfinished
- Nothing partially implemented. Admin screens for Phase 6 not started.

## Exact next steps
1. Confirm CI for the latest commit (`gh run list --branch feature/content-cms`).
2. CSV/XLSX import with validation preview (owner to share a sample of their existing question sheets).
3. Assessments schema + builder (D-021/D-044), then grading/results with the attempt engine.
4. When the owner enables Bunny CDN token auth, re-run the stream check (KI-023).

## Files changed
- See `CHANGELOG.md` → Phase 6.

## Database / API changes
- Migration `content_catalog`; endpoints in `API_DOCUMENTATION.md` §1b.

## Tests run
- `pnpm format:check && pnpm build && pnpm lint && pnpm typecheck && pnpm test` → all passing, 261 tests; `pnpm --filter @tk/admin e2e` → 15 passing.

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
