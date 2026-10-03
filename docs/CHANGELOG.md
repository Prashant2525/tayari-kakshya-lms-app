# Changelog

All notable changes to this project. Format based on Keep a Changelog.

## [Unreleased]

### Added — 2026-10-03 (Phase 8: student app foundation)
- `apps/mobile`: Expo SDK 57 + Expo Router student app — sign up, login (device-limit choice), forgot/reset password
  by code, email/SMS verification, onboarding target post, tabs (Home, Courses, Notices, Profile), language (en/ne)
  and theme (auto/light/dark), BS dates, maintenance and force-update screens, offline banner, empty/error/loading
  states. All content comes from the API/CMS.
- API: migration `user_target_posts`, `GET/PUT /me/target-posts`, `childCount` on `/exam-nodes`, setting
  `app.storeLinks` (admin settings page + `/app/config`); `X-TK-App-Version` allowed by CORS.
- Development: the app finds the local API automatically (no `apps/mobile/.env`); `.env.example` allows the Expo web
  origin `http://localhost:8081` in CORS.
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
