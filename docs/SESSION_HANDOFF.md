# Session Handoff

Session date: 2026-10-02 (session 4 — resumed after a VS Code crash)
Current phase: **Phase 6 — content CMS, API layer complete and verified locally**
Current task: Phase 6 Admin CMS screens (not started)

## Completed this session
- Recovered the interrupted work from the repository (nothing lost). Verified the uncommitted content API:
  fixed the Bunny token test (independent SHA-256 vector), replaced the watermark test with a content-stream check
  (and fixed a double-space bug it found), removed a brittle PDF-producer assertion.
- Mutation check: forcing `hasSubjectAccess` to return true makes 3 catalog tests fail (access tests are real).
- CI `verify` failed on `aeef198` (media PDF upload returned 500 in CI only). Hardened CI: SeaweedFS started with
  `-volume.max=0 -master.volumeSizeLimitMB=256`, readiness wait on `/dir/assign` (fails with container logs),
  `TEST_LOG_LEVEL=error` so server errors appear in CI output (KI-021).

## Decisions taken during implementation
- T-020 resolved (SeaweedFS), T-025 (API-validated uploads), T-026 (live-edit rule), T-027 (archived courses stay
  visible to entitled students), T-028 (instructor scopes). See `DECISIONS.md`.

## In progress / unfinished
- Nothing partially implemented. Admin screens for Phase 6 not started.

## Exact next steps
1. `gh run list --branch feature/content-cms` — confirm `verify` and `admin-e2e` pass. If `verify` still fails, the
   API error is now logged in the job output (KI-021).
2. Admin CMS: media library page + reusable media picker.
3. Exam taxonomy tree + papers; subjects → chapters → topics → items with TipTap note editor; courses (details,
   pricing, subjects, links, publishing); student access grants on the student detail page. Command palette and the
   generic data table (deferred from Phase 5).
4. Playwright E2E for the content flow; browser walkthrough with screenshots.
5. Open the PR `feature/content-cms` → `main` once the screens are done.

## Files changed
- See `CHANGELOG.md` → Phase 6.

## Database / API changes
- Migration `content_catalog`; endpoints in `API_DOCUMENTATION.md` §1b.

## Tests run
- `pnpm format:check && pnpm build && pnpm lint && pnpm typecheck && pnpm test` → all passing, 198 tests.

## Known issues / blockers
- KI-021 (CI-only media failure — fix pending CI confirmation), KI-022 (per-request watermark cost). No blockers.

## Credentials still required
- Bunny Stream (library ID, API key, token key, CDN hostname) for premium video; R2 before staging.

## Questions for the owner
- L6: free (price 0) courses — open to all or enrol step?

## Local environment notes
- Dev DB has Super Admin `owner@example.test` (dev-only password `Dev-only password 1`, 2FA reset — enrol on first sign-in).
- SeaweedFS S3 on :8333 (dev keys in `infra/docker/seaweedfs/s3.json`). Public media is served by the API proxy in dev.
- If Docker isn't running after a reboot, start Docker Desktop, then `pnpm infra:up`.
- Git Bash mangles `/paths` in docker args — prefix with `MSYS_NO_PATHCONV=1`.
- If the Bash heredoc tool fails on long scripts, write the script to the scratchpad and run it.
