# Project State

Current Phase: **Phase 8 — Student mobile foundation: WAITING FOR DESIGN SIGN-OFF** (Phase 7 builder merged, PR #8)
Current Milestone: content API on `feature/content-cms` → Admin CMS content screens
Overall Status: **IN PROGRESS**
Last updated: 2026-10-03

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
- Phase 8 on `feature/mobile-foundation`: design preview published for owner sign-off (DESIGN_SYSTEM §10 gate).
  No app code until the owner approves or requests changes.
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
- Mobile: design preview awaiting sign-off (Phase 8). Website: not started (Phase 11).

## Tests
- Unit/integration 283 · browser E2E 19 — all passing locally (see `TEST_STATUS.md`).

## Known Issues
- See `KNOWN_ISSUES.md` (KI-021 CI storage flake under investigation, KI-022 per-request PDF watermarking, KI-023 Bunny token auth).

## Blockers
- None for local work.

## User Decisions Required
- **Sign off the student app design preview** (or list changes) before Phase 8 code starts. L6 answered: free courses use an Enrol step (D-043, implemented).

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
- After design sign-off: scaffold `apps/mobile` (Expo + Expo Router), theme from `@tk/design-tokens`, Mukta, i18n
  en/ne + BS dates, API client + secure storage, auth flows, app states, `/app/config` — see SESSION_HANDOFF.
