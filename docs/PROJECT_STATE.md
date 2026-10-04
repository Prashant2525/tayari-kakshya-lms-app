# Project State

Current Phase: **Phase 9 complete** · monitoring merged (PR #14); Sentry for app + admin on `feature/sentry-app-admin` · next §10
Current Milestone: content API on `feature/content-cms` → Admin CMS content screens
Overall Status: **IN PROGRESS**
Last updated: 2026-10-04

## Completed
- Phases 0–3: discovery, PDF extraction, decisions, approved architecture.
- Phase 4 (merged, PR #3): monorepo, local infra, domain/contracts packages, API foundation, CI.
- Phase 5 (merged, PR #4): staff 2FA, education levels, design tokens, Admin CMS foundation, Playwright E2E.
- Phase 6 so far (branch `feature/content-cms`):
  - Object storage (S3-compatible: SeaweedFS locally/CI, Cloudflare R2 in production) and media library with
    server-side validated uploads (T-025): real file type sniffing, images re-encoded to WebP variants, PDFs private.
  - Content schema migration `content_catalog` (taxonomy, papers, subjects → chapters → topics → learning items,
    videos, courses, instructors, entitlements).
  - Content API: exam taxonomy + papers, subjects/chapters/topics/items with reorder, soft delete/restore and the
    publish workflow (D-036), courses (details, pricing, subjects, exam links, instructors, publishing), instructor
    profiles, staff scopes, admin access grants/revokes.
  - Student/public API: catalog (exam tree, course list/detail with platform-aware prices), my courses, subject outline,
    learning items with server-side locking, watermarked PDF stream, video playback (YouTube nocookie / signed Bunny),
    free-course enrolment (D-043).
  - Admin CMS: media library + picker, exam categories tree, papers, subjects outline and item editor (TipTap notes
    in en/ne, PDFs, videos, publishing/scheduling), courses, instructors, student course access, staff content
    limits — verified in a real browser (E2E + screenshots in light, dark, mobile).

## In Progress
- Phase 7 builder merged (PR #8). Grading queue and result release move to §10 (they need attempts).
- Phase 8 merged (PR #9, #10). Still open from it: Sentry/PostHog (keys, KI-028), a run on a real phone (KI-031).
- Phase 9 part 1 merged (PR #11, YouTube fix PR #12): catalog, course page + Enrol, Home current course + Continue,
  subject outline, note / PDF / video lessons with progress (T-038, T-039).
- Monitoring (T-042): Sentry in the API + worker and PostHog in the app merged (PR #14); Sentry in the app and the
  admin CMS on `feature/sentry-app-admin`. Google web client registered for `http://localhost:8081` (checked); a real
  sign-in by the owner and Android/iOS clients remain (KI-029).
- Phase 9 part 2 merged (PR #13): practice questions with Check answer and locked Premium answers
  (T-041), report a question, bookmarks + Saved, unified search, edit profile (BS date of birth), change password,
  signed-in devices, delete account (request / keep). Migration `bookmarks`.
- Dynamic admin audit done (`DYNAMIC_ADMIN_AUDIT.md`, D-045): category types and question types are now admin-managed.
- Phase 6 merged (PR #5, #6). Bunny security verified (KI-023 resolved).

## Remaining
- Phases 7–18 (`IMPLEMENTATION_PLAN.md`).

## Database Changes (Phase 6)
- Migration `content_catalog`: `media_assets`, `exam_nodes`, `papers`, `post_papers`, `subjects`, `chapters`, `topics`,
  `learning_items`, `video_assets`, `courses`, `course_exam_nodes`, `course_subjects`, `course_instructors`,
  `instructor_profiles`, `entitlements` (`staff_scopes` already existed from Phase 4). Partial unique slugs, CHECK constraints, trigram index.

## API Changes (Phase 6)
- See `API_DOCUMENTATION.md` §1b. New permissions: `media:manage`, `taxonomy:manage`, `content:edit`,
  `content:publish`, `courses:edit`, `courses:publish`, `courses:pricing`, `instructors:manage`, `entitlements:grant`.
- New error codes: `VIDEO_PROVIDER_NOT_CONFIGURED`, `CONTENT_LOCKED`, `VERIFICATION_REQUIRED`.

## Admin CMS
- `apps/admin` — run `pnpm --filter @tk/admin dev` (http://localhost:5173, proxies `/api` to the API on :4000).

## Mobile / Website
- Mobile: `apps/mobile` — `pnpm --filter @tk/mobile dev` (Expo; press `w` for web, or scan with Expo Go). Website: not started (Phase 11).

## Tests
- Unit/integration 352 · browser E2E 20 (admin) + 14 (student app) — all passing locally (see `TEST_STATUS.md`).

## Known Issues
- See `KNOWN_ISSUES.md` (KI-021 CI storage flake under investigation, KI-022 per-request PDF watermarking, KI-023 Bunny token auth).

## Blockers
- None for local work.

## User Decisions Required
- None blocking. App identifiers (L5) are needed before the first store build. L6 answered: free courses use an Enrol step (D-043, implemented).

## Credentials Required
- Bunny Stream: **provided** (local `.env` only). Embed + CDN token authentication on and verified (T-031). Optional: `YOUTUBE_API_KEY` for automatic title/duration.
- Cloudflare R2 bucket + keys before staging/production (local dev uses SeaweedFS).

## Launch configuration checklist (owner enters in CMS before go-live)
Taxonomy & courses · prices/sale prices/validity · plans & inclusions · coupons · VAT/PAN/invoice prefix · refund policy text ·
device limit · verification channels · staff 2FA policy · purchase channels per platform · assessment rules · certificate rules ·
contact options · legal pages (reviewed drafts) · education level list · notification templates review.

## Local quick start
`pnpm install` → `pnpm infra:up` → `.env` from `.env.example` (generate secrets incl. `ENCRYPTION_KEY`; S3 dev keys are
in `infra/docker/seaweedfs/s3.json`) → `pnpm build` → `pnpm --filter @tk/api db:deploy` → `pnpm --filter @tk/api dev`
and `pnpm --filter @tk/admin dev` → create your Super Admin:
`pnpm --filter @tk/api cli create-super-admin --email you@example.com --name "Your Name"`
(code in Mailpit http://localhost:8025) → set password at http://localhost:5173/set-password → sign in → enrol 2FA.

## Exact Next Task
- Owner merges the Sentry app/admin PR; then §10 exam engine + engagement (assessments list, exam mode, results, history,
  daily challenge, leaderboards, certificates, mistake notebook) — see SESSION_HANDOFF.
