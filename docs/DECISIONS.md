# Decisions Log

Only owner-confirmed product/business decisions and approved technical decisions belong here.
Source of answers: `OPEN_QUESTIONS.md` (owner answers, 2026-10-02) + follow-up clarifications the same day.

**Principle adopted from the answers ("manage from admin portal"):** wherever the owner chose admin control, the rule is
implemented as **validated configuration data in PostgreSQL, editable in the Admin CMS**, with no hard-coded business
values. Development seed data uses clearly fake placeholder values; real values are entered by the owner before launch
(tracked in `LAUNCH_CONFIG_CHECKLIST` section of `PROJECT_STATE.md`).

## Product & scope

| ID | Decision | Ref |
|---|---|---|
| D-001 | Mobile app uses **React Native** (Expo). | master prompt, Q42 |
| D-002 | **PostgreSQL** is the canonical primary database. | master prompt |
| D-004 | Surfaces: student mobile app (Android + iOS), web Admin CMS, backend API, **public website** (course pages, web checkout, legal pages — needed for iOS purchases and SEO). | Q5, Q26, S21 |
| D-005 | UI PDF is a functional reference; visual design is redesigned into a premium, accessible design system. Brand palette is refined by us (no logo yet — placeholder wordmark until owner supplies one). | Q1 |
| D-007 | Exam taxonomy is **fully admin-managed** and generic. Launch content: Nepal Police, Nepal Army, APF, NID (posts e.g. Sainey Likhit, Officer Cadet, Prahari Jawan) — entered via CMS, not code. Lok Sewa (PSC) and any other authority can be added later without code changes. | Q2, Q3 |
| D-008 | **Bilingual UI (English/Nepali) with in-app toggle.** CMS text fields are localizable (en/ne, at least one required, fallback to the other). | Q4 |
| D-009 | **Dates displayed in Bikram Sambat (BS)**; stored as UTC timestamps / AD dates; timezone Asia/Kathmandu. | Q4 |
| D-010 | Approved hierarchy: configurable exam taxonomy (Authority → Level → Service → Group → Post, levels optional) + Paper; reusable content tree Subject → Chapter → Topic → items; Courses link to posts/papers and include ordered subjects. Subjects/chapters/questions are **shared and reusable** across courses (as proposed). | Q6 |
| D-011 | A student may hold **several active courses**; Home provides a current-course switcher. | Q7 |
| D-012 | Paper/subject metadata (full marks, pass marks, duration) is **entered by admins**. | Q8 |
| D-013 | Instructors have public profiles shown to students; instructors are CMS users whose permissions are granted by the Super Admin. | Q9 |

## Content & learning

| ID | Decision | Ref |
|---|---|---|
| D-014 | Notes support **both rich-text and PDF**. PDFs are **downloadable with a per-user watermark** (name/email/phone + date). | Q10 |
| D-015 | **Hybrid video hosting**: per video the admin chooses **Bunny Stream** (token-protected HLS, offline-capable; for premium) or **YouTube unlisted** (for free/promo). YouTube *private* videos are technically impossible for app users. Offline download only for Bunny videos. CMS warns when YouTube is used for premium content. | Q11 + follow-up |
| D-016 | Question types: the system ships the full engine set (single-choice MCQ, multiple-answer, true/false, fill-in-the-blank, match-the-following, numerical, subjective with model answer, passage/comprehension groups, image in stem/options). Admins enable/disable types and author freely. A *new* type beyond these engines requires development. | Q12 |
| D-017 | Quiz defaults: results **after submission**, explanations shown, **unlimited retakes**, **timed** — all overridable per quiz in the CMS. | Q13 |
| D-018 | "Gorkhapatra" section = **team-written summaries** of exam-relevant Gorkhapatra news with date + source link. No republishing of Gorkhapatra articles/e-paper. | Q14 follow-up |
| D-019 | Notice tab = **official exam notices + announcements + instructor messages** (one-way broadcasts from CMS, audience-targetable). Two-way discussion is a separate feature (S12). | Q15 |
| D-020 | Owner holds rights to previous-year questions; PYQs managed in the CMS. | Q16 |

## Exams & engagement

| ID | Decision | Ref |
|---|---|---|
| D-021 | Weekly/mock/all assessment rules are **CMS-configurable per assessment**: availability (fixed window or open period), duration, marks, negative marking, pass mark, attempts, result release (immediate / after window / manual), leaderboard on/off, access (free/premium/course/plan), blueprint sections, shuffling, subjective grading mode (self-evaluated or instructor-graded). | Q17, Q18 |
| D-022 | **At launch:** daily challenge, streaks, leaderboard, certificates. | Q19 |

## Commerce

| ID | Decision | Ref |
|---|---|---|
| D-003 | Payment provider abstraction with server-side verification. **Launch gateways: eSewa and Khalti** (owner has merchant accounts). ConnectIPS implemented later behind the same interface. | Q25 |
| D-023 | **Both** per-course purchases and plans (Free/Premium…). "Forever" = lifetime. Prices, sale prices, plan contents, validity (days / fixed end date / lifetime) are CMS-managed. | Q20, Q21 |
| D-024 | Free vs premium is set **per content item** by admins. | Q22 |
| D-025 | Coupons and time-limited sale prices are CMS-managed (type, value, validity, usage limits, applicable products). | Q23 |
| D-026 | Tax/invoice/refund settings are CMS-managed: VAT on/off, rate, inclusive/exclusive pricing, PAN/VAT number, invoice numbering prefix/fiscal-year reset; refunds via an admin-approved workflow. | Q24 |
| D-027 | **Purchase channels:** Android app → in-app eSewa/Khalti checkout. iOS app → **no purchase UI, prices or external purchase links**; users buy on the website and the iOS app unlocks content. Website checkout available to all. Channel availability per platform is a server-side setting (changeable without an app release). Apple IAP may be added later. Entitlements are channel-independent. | Q26 + follow-up |
| D-028 | Device/concurrent-session limit is enforced and **configurable in the CMS** (global default + per-user override). | Q27 |

## Accounts & communication

| ID | Decision | Ref |
|---|---|---|
| D-029 | Sign-up: **email + password** and **Google**. Verification channels (email and/or phone OTP) are toggled in the CMS; if both are enabled the student chooses. | Q28 |
| D-030 | Password reset by **OTP code** (6 digits). | Q29 |
| D-031 | Profile field "Student" on Edit Profile = **Education level** (option list managed in CMS). | Q30 follow-up |
| D-032 | **Self-service account deletion** in Profile with a 7-day grace period; personal data erased afterwards; payment/invoice records retained anonymised. | Q31 follow-up |
| D-033 | Notification channels: **push + in-app + email**. Events: purchase, course update, exam reminder, result (+ CMS notices/announcements). No marketing notifications at launch. Students can toggle categories. | Q32 + follow-up |
| D-034 | Support = **contact options** (phone/WhatsApp/email/etc.) managed in the CMS; no ticketing at launch. | Q33 |
| D-035 | **All suggested features S1–S24 approved** (see `SUGGESTED_FEATURES.md`). Sequencing per `IMPLEMENTATION_PLAN.md`. | Q34 |

## Admin & operations

| ID | Decision | Ref |
|---|---|---|
| D-036 | RBAC: a protected **Super Admin** creates roles with selected permissions and assigns them (Admin, Content Manager, Instructor, …). Publishing is a separate permission, so users without it submit content for review. | Q35 |
| D-037 | Hosting: **Nepal-based VPS** for API, worker, PostgreSQL, Redis, admin and website. PDFs/images on Cloudflare R2; premium video on Bunny Stream (global CDNs). | Q36 + follow-up |
| D-038 | Terms, Privacy, Refund and About pages: **drafted by Claude, marked DRAFT**, reviewed and amended by the owner before publishing. | Q37 |
| D-039 | Product analytics: **PostHog**. Error monitoring: Sentry (part of approved stack). | Q38, Q42 |
| D-040 | Scale target: ~250–500 users at launch, ~1,000 in year 1 → single-VPS modular monolith; no horizontal scaling infrastructure needed now, but stateless design keeps that option open. | Q39 |
| D-006 | GitHub `origin` is the primary remote; conventional commits; no force-push or secret commits. **Feature branches + PRs into `main`.** | Q40 |
| D-041 | Design PDF removed from tracking going forward (normal commit + `.gitignore`); history is **not** rewritten. `PDF_UI_FEATURE_EXTRACTION.md` is the in-repo reference. | Q40 follow-up |
| D-042 | Local dev uses **Docker Desktop** (Postgres + Redis via Docker Compose). Owner has Android Studio. | Q41 |
| D-045 | **The Admin CMS is the central control system** (owner, 2026-10-03). Every business/content entity is admin-managed (tables + CMS CRUD, publish/schedule/order/activate, import/export where useful); choice lists without code behaviour are tables or settings, not enums; the mobile app and website render only server data. Security-critical logic stays in code. Audit and rules: `DYNAMIC_ADMIN_AUDIT.md`. | Owner 2026-10-03 |
| D-046 | Question import uses one **universal Excel template** (`tk-questions-v1`, `docs/templates/question-import-template.xlsx`): category paths of any depth (authority > … > post > exam stage), all 7 question types, bilingual text, PYQ source, passages; designed by us because the owner has no existing sheet. | Owner 2026-10-03 |
| D-044 | **Scoring rules are CMS choices, never constants** (owner answers to Q12/Q13/Q17/Q18: "manage from admin portal"): partial credit for multiple-answer, match and fill-in-the-blank (all-or-nothing or proportional), negative marks per question/assessment, and whether a total may go below zero are chosen per assessment. Negative marks apply only to wrong answers — never to skipped or partially correct ones. Defaults for new assessments live in admin-managed settings. | Q12, Q13, Q17, Q18 |
| D-047 | **Student app design approved** (owner, 2026-10-03): the design preview canvas (tokens, components, app states, sign-in, onboarding, Home, course on Android/iOS, subject, reader, video, questions, exam, result, Nepali + dark, profile, notices) is the visual reference for the student app. | Design preview gate (DESIGN_SYSTEM §10) |
| D-043 | **Free courses (list price 0) use an Enrol step**: premium items stay locked until the student taps Enrol, which creates a `free_enrol` entitlement (shows in My courses, counts in analytics). Access lasts for the course's configured validity; a course whose fixed end date has passed cannot be joined. A paid course on a temporary sale is not "free". | L6 (2026-10-02) |

## Technology (approved stack — Q42)

| ID | Area | Decision |
|---|---|---|
| T-001 | Mobile | Expo (React Native, TypeScript), Expo Router, dev builds, EAS |
| T-002 | Backend | NestJS on Fastify (modular monolith; API process + worker process) |
| T-003 | API | REST `/api/v1` + OpenAPI + generated TypeScript client |
| T-004 | ORM | Prisma (+ raw SQL for reports) |
| T-005 | Auth | In-house: Argon2id, short-lived JWT access + rotating hashed refresh tokens per device session, Google ID-token verification, OTP |
| T-006 | State | TanStack Query + Zustand (+ MMKV persistence on mobile) |
| T-007 | Storage | Cloudflare R2 (private + public buckets, presigned URLs) |
| T-008 | Video | `VideoProvider` abstraction: Bunny Stream + YouTube (D-015) |
| T-009 | Cache/jobs | Redis + BullMQ |
| T-010 | Search | PostgreSQL FTS + pg_trgm |
| T-011 | Push | expo-notifications + Expo Push Service |
| T-012 | Admin CMS | React + Vite + TanStack Router/Query/Table + React Hook Form + Zod + shadcn/ui + Tailwind + TipTap |
| T-013 | Monitoring | Sentry + Pino logs + uptime checks + PostHog |
| T-014 | Repo | pnpm + Turborepo monorepo, GitHub Actions CI |
| T-015 | Public website | **Next.js** (App Router) — SEO course pages, web checkout, legal pages. *Technical choice implied by D-004/D-027; TECH_STACK_OPTIONS listed Next.js as the fit for a public site.* |
| T-016 | TypeScript | Pinned to **TypeScript 6.0.x**. TS 7 (native) lacks the JS compiler API that typescript-eslint (`<6.1`) and NestJS/Prisma tooling need. Revisit when the ecosystem supports TS 7. |
| T-017 | API build | API compiles with **`tsc`** (emits decorator metadata); tests transpile with TypeScript's `transpileModule` via a small Vite plugin. SWC was dropped: Windows Smart App Control blocks its unsigned native binary on the dev machine. |
| T-018 | Admin CSRF | Admin refresh token in an HttpOnly, SameSite=Strict cookie scoped to `/api/v1/admin/auth`; cookie endpoints require the `X-TK-Client: admin` header (custom-header CSRF defence + CORS allow-list). Replaces the double-submit idea in ARCHITECTURE §4 because the CMS and API live on different subdomains. |
| T-019 | Dependencies | pnpm 12 blocks install scripts by default; only packages in `pnpm-workspace.yaml` `allowBuilds` may run them (Prisma engines, argon2, msgpackr-extract). `@scarf/scarf` telemetry is denied. |
| T-020 | Local object storage | `minio/minio` images are no longer published on Docker Hub. **Resolved (Phase 6): SeaweedFS** (`chrislusf/seaweedfs`, Apache-2.0, S3 API) locally and in CI; production uses Cloudflare R2 through the same S3 client. |
| T-021 | Admin CMS language | Admin **interface chrome is English**; all content fields stay bilingual (en/ne). D-008's toggle applies to the student app and website. |
| T-022 | Staff 2FA | RFC 6238 TOTP + 10 single-use recovery codes; secrets AES-256-GCM encrypted (`ENCRYPTION_KEY`); policy setting `auth.staffMfa`, default **required for Super Admins** (ARCHITECTURE §4). |
| T-023 | Admin E2E | Playwright against the real API on a dedicated `*_e2e` database (created, migrated and reset by `apps/admin/e2e/start-api.mjs`); runs in CI job `admin-e2e`. |
| T-024 | Design tokens | `@tk/design-tokens` is the single source for colour/typography/spacing; an automated WCAG test guards every text/background pair in light and dark themes. |
| T-025 | Uploads | Uploads go **through the API** (multipart) instead of presigned PUT: the server sniffs the real type, re-encodes images to WebP (w320/w640/w1280, metadata stripped), checks PDFs, and stores PDFs privately (served only via short-lived signed URLs or the watermarked stream). Replaces the presigned-upload idea in T-007; large video goes to Bunny directly. |
| T-026 | Publishing | Editing content that is **live** (published, or scheduled) needs the publish permission, so edits cannot bypass review (extends D-036). "Live" is evaluated at read time (`published`, or `scheduled` with `publishAt <= now`) — no job needed to go live. |
| T-027 | Archived courses | Archiving hides a course from the catalog but **students with an active entitlement keep access** until it expires. A course cannot be deleted while active entitlements exist. |
| T-028 | Instructor scope | `staff_scopes` restrict a staff member to assigned courses/subjects; staff without scope rows and Super Admins are unrestricted. Scoped staff cannot create top-level subjects/courses. |
| T-029 | PDF watermark | Every PDF a student opens is stamped per request with email/phone, an 8-character account id and the date (ASCII only, every page). |
| T-030 | Question bank | Question metadata on `questions`; stem/choices/answer key in `question_versions`, which a database trigger makes **immutable** (every content edit inserts a new version) so attempts always show what the student saw. Marks are computed in integer centimarks. Fill-in-the-blank matching normalises Unicode (NFC), Devanagari digits, case (unless the blank is case-sensitive) and spacing. Blanks are marked `[[b1]]` in the question text. |
| T-031 | Video playback security | Bunny **embed** tokens (SHA-256 of token key + video id + expiry) signed by the API after the access check; lifetime **5 minutes** (`VIDEO_PLAYBACK_TTL_SECONDS`) — verified 2026-10-03 that Bunny's player then signs CDN segment URLs itself (~10 h), so long lectures keep playing. **React Native plays the signed embed URL in a WebView** (no Referer is sent, which Bunny allows — verified); authorization is the token, not Allowed Domains. Native Bunny SDKs (HMAC with the library API key) are not used; revisit only if offline downloads/DRM need them. |
| T-032 | Category types | `exam_node_types` table (key, name, rank, top-level, can-have-papers, active) replaces the fixed enum; `exam_nodes.node_type` is a FK to its key (converted in place, data kept). Seeds: authority, level, service, group, sub-group, post, exam stage. |
| T-034 | Mobile preferences | Non-secret per-device preferences (language, theme, onboarding skipped) use AsyncStorage; tokens and the install id use expo-secure-store (Keychain/Keystore). MMKV (T-006) is adopted with the offline query cache (§9/§14), where its synchronous speed matters. |
| T-035 | Mobile stack | Expo SDK 57 (React Native 0.86, React 19.2, Expo Router 57, typed routes), pinned exact versions. The **web build is for development and browser tests only** (students use the native apps and the Next.js website). Verified on this machine: web and Android (Hermes) bundles build; no unsigned native Node binaries needed. |
| T-036 | E2E harness | `@tk/e2e-support` holds the browser-test API environment, database reset and launcher shared by the admin and student-app suites; each suite has its own `*_e2e` database, Redis DB and port. The student suite sends real email to Mailpit and reads verification/reset codes from it (CI: Mailpit service). |
| T-037 | App route guards | Signed out → auth screens; CMS requires verification, or the account was just created → verify (skippable when not required); no target post and not skipped on this device → onboarding; otherwise tabs. Guards are UX only (the API enforces access). Screens that change guard state navigate after the next render. |
| T-038 | In-app PDF reader | PDFs are read in a page served by the API (`/api/v1/viewer/pdf`) that renders with **self-hosted pdf.js** (`pdfjs-dist` legacy build, allow-listed files only, strict CSP, framing limited to the app's origins). The app posts the student's access token to the page, which fetches the per-request watermarked PDF (T-029) and renders pages as images (no selectable text). No third-party CDN sees premium PDFs; the same reader works in the phone WebView and the web build. |
| T-039 | Learning progress | Progress belongs to the learning item (subjects are shared between courses): position (video seconds / PDF page) and completion, which is permanent. `course_id` only remembers where the item was opened, for Home → Continue. Course progress = finished / live items in the course's subjects. Videos count as watched at 90 %. |
| T-040 | Video embed Referer | **YouTube** embeds send a Referer — web: `strict-origin-when-cross-origin`; phones: `https://<application id>` (YouTube's rule for embedding apps) — because YouTube refuses to play without one (player error 153, reported by the owner and reproduced in a browser and on the Android emulator). **Bunny** embeds keep sending none (T-031). |
| T-041 | Practice questions & bookmarks | Practice is unmarked and not stored: the app checks an answer with the shared scoring engine (`@tk/domain`), only to tell correct / partly correct / wrong apart — partial credit for an incomplete multiple choice with no wrong option, per pair, per blank. Marks, negative marking and the scoring choices of D-044 apply only to assessments (§10). Written answers show the model answer for self-review. Answer keys, model answers and explanations of **locked** questions are never sent (`answer: null`, rule 5); the question body is sent so students see what Premium contains. Bookmarks: one table keyed by (user, target type, target id) for lessons and questions; unpublished targets are hidden, erased with the account. |
| T-042 | Monitoring & analytics privacy | **Sentry (API + worker):** on only when `SENTRY_DSN_API` is set; unexpected errors only (no `AppError`s, no 4xx); Sentry 11's data collection switched off (user info, cookies, bodies, query strings, local variables) and every event scrubbed again; tagged with the request id and route pattern so it can be matched to our logs; no performance tracing. **PostHog (app):** on only when `EXPO_PUBLIC_POSTHOG_KEY` is set; students are identified by `analyticsId` — HMAC-SHA256 of the account id with a key derived (HKDF) from `ENCRYPTION_KEY` — never the account id, name, email or phone; no person properties; screens by route pattern; a fixed list of events with plain properties (no search text); no session replay, touch autocapture, error capture, remote feature flags or surveys; URL-like properties removed before sending. **Sentry (admin, app):** same rules — on only with a DSN, no user, no breadcrumbs (clicked text, console output and request URLs would leak personal data), no replay, screenshots or view hierarchy, no tracing; only the page path is kept; the admin reports only non-API errors (the API reports its own). `@sentry/cli` (native binary) does not run on developer machines (KI-011); source maps are uploaded by release builds. Test and CI builds never use the real projects. |
| T-033 | Question types switch | Setting `questions.types` (enabled list + display names), exposed in `/app/config`; new questions of a disabled type are refused. |
