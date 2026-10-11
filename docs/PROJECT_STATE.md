# Project State

Current Phase: **Phase 13 progress & community** — part 13e (reports) on `feature/dashboards`; **Phase 13 complete**
Current Milestone: content API on `feature/content-cms` → Admin CMS content screens
Overall Status: **IN PROGRESS**
Last updated: 2026-10-11

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
- §10 part 1 merged (PR #16): attempt engine (T-043, D-048), exam mode, results, review, history.
- §10 part 2 merged (PR #17): grading queue, results, release (T-044); scope fix (KI-035).
- §10 part 3a merged (PR #18, D-049, T-045): daily challenge + streak, leaderboards, practice; guard fix (KI-037).
- §10 part 3b merged (PR #19, D-050, T-046): certificates.
- §10 part 3c merged (PR #20, T-047): mistake notebook.
- §10 hardening on `feature/exam-hardening` (T-048): late saves, concurrent submits, offline answers kept (KI-039).
- Q25 answered (D-051): eSewa + Khalti with official test credentials first; everything from `.env`.
- Phase 11 part 1 on `feature/commerce` (T-049, D-052): course purchase with eSewa + Khalti (test mode), server-side
  verification, Orders in the CMS. Merged (PR #22).
- KI-042 (eSewa on the Android emulator) fixed on `fix/android-payment-return` (PR #23, CI green).
- Phase 11 part 2a on `feature/plans-coupons` (T-050): plans in the CMS and the app, plan checkout and renewal.
  Merged (PR #24).
- Phase 11 part 2b on `feature/coupons-vat` (T-051, D-055, D-056): coupons, VAT settings, Rs 0 orders.
  Merged (PR #25).
- Phase 11 part 3 on `feature/receipts-refunds` (T-052, D-057): receipts (PDF, email, numbering) and refunds.
  Merged (PR #26).
- Phase 11 part 4a (T-053): the public Next.js website. Merged (PR #27, dev fix PR #28).
- Phase 11 part 4b (T-054, D-058, D-059): referral programme. Merged (PR #29).
- Phase 12a on `feature/notices` (T-055, D-060): notices (CMS, Notice tab, optional push + email) and the
  notification pipeline (in-app, outbox, Expo push, email, preferences). Push on phones waits for the owner's EAS
  project (KI-048). Merged (PR #30).
- Phase 12b on `feature/event-notifications` (T-056): purchase, result and exam-reminder notifications; CMS
  "Notify students" on the course page; exam reminder times in System settings. Merged (PR #31).
- EAS setup (T-057, PR #32) and iPhone buyers on `feature/ios-buy-guidance` (D-061, T-058): welcome email,
  "Interested on iPhone" list with buying-link emails, Apple-safe locked-course text. Then `feature/email-buying-guide`
  (D-062, T-059): the how-to-get-courses box in student emails. Merged (PR #32–#34).
- Phase 12c part 1 (T-060, D-063): articles in the CMS, API and app. Merged (PR #35).
- Phase 12c part 2 on `feature/articles-web` (T-061): articles on the website and in search; search fix KI-050.
  Merged (PR #36).
- Phase 12d part 1 on `feature/help-pages` (T-062, D-064): pages with DRAFT legal texts and versions, FAQs, contact
  options — CMS, app and website. Merged (PR #37).
- Phase 12d part 2 on `feature/banners` (T-063): banners in the CMS, app Home and website home. **Phase 12 complete.**
  Merged (PR #38). Fixes merged: pictures on phones and Expo Go on Android, app identifiers (PR #39, D-065), CI
  browser install (PR #40, KI-052).
- Phase 13 decided (D-066). Part 13a on `feature/progress-analytics` (T-064): study time, accuracy, weak / strong
  topics, My progress in the app, CMS thresholds. Merged (PR #41).
- Phase 13b on `feature/study-planner` (T-065): study plans per course, re-planned from today; Home card; CMS
  estimates. Merged (PR #42).
- Phase 13c on `feature/course-reviews` (T-066): reviews with staff approval; ratings in the app and on the
  website. Merged (PR #43).
- Phase 13d on `feature/discussions` (T-067): doubts under questions and lessons with teacher answers and
  moderation. Merged (PR #44).
- Phase 13e on `feature/dashboards` (T-068): CMS Reports and CSV exports. **Phase 13 complete.** Next: Phase 14 (advanced).
- Monitoring (T-042) merged (PR #14, #15): Sentry in the API, worker, admin and app; PostHog in the app. Google web client registered for `http://localhost:8081` (checked); a real
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
- Unit/integration 384 · browser E2E 21 (admin) + 20 (student app) — all passing locally (see `TEST_STATUS.md`).

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
- Owner merges the receipts PR, restarts the API and the worker (migration `receipts_refunds`), gives staff roles
  `refunds:request` / `refunds:approve`, tries a purchase (receipt in Mailpit) and a refund. Next: part 4.
