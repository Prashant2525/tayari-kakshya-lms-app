# API Documentation (Design v1.0)

Status: **design catalogue** (Phase 3). The authoritative contract will be the generated OpenAPI document at
`/api/docs` (non-production) and `packages/contracts`. This file tracks conventions and planned endpoints; mark each
endpoint ✅ when implemented and tested.

## 1. Conventions

- Base path `/api/v1`. JSON only. `Accept-Language: en|ne` selects localized fields (both returned with `?locales=all`).
- Auth: `Authorization: Bearer <access JWT>`. Student and staff tokens have different audiences; `/admin/*` requires staff.
- Pagination: cursor-based `?cursor=&limit=` (max 100) → `{ data: [], nextCursor }`; admin tables may use `?page=&pageSize=&sort=&filter[...]`.
- Errors: `{ "error": { "code": "DEVICE_LIMIT_REACHED", "message": "...", "details": {...}, "requestId": "..." } }` with proper HTTP status. Codes are stable and documented in `packages/contracts/errors.ts`.
- Idempotency: mutating payment/order/attempt endpoints accept `Idempotency-Key` header.
- Money in paisa (integers). Dates ISO-8601 UTC; clients render BS.
- Locked content: list items include `access: { locked: boolean, reason?: "premium" | "not_published" }`; bodies/URLs omitted when locked.
- Rate limits returned via `RateLimit-*` headers; `429` with `RATE_LIMITED`.

## 1a. Implemented endpoints (Phase 4) ✅

Authoritative shapes: OpenAPI at `/api/docs` (local) and `packages/contracts`. Where these differ from the plan below,
**this table wins**.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health/live`, `/health/ready` | public | ready checks PostgreSQL + Redis |
| GET | `/app/config` | public | maintenance, min versions, purchase channels, verification channels, enabled question types + display names |
| POST | `/auth/register` | public | → tokens; sends email verification code if enabled |
| POST | `/auth/login` | public | optional `replaceSessionId` when `DEVICE_LIMIT_REACHED` |
| POST | `/auth/google` | public | ID token verified server-side |
| POST | `/auth/refresh` | public | rotation; reuse ⇒ session revoked (`REFRESH_TOKEN_REUSED`) |
| POST | `/auth/logout` | student | revokes current session |
| POST | `/auth/password/forgot` | public | always 202 |
| POST | `/auth/password/reset` | public | `{ email, code, newPassword }`; revokes all sessions; also used by invited staff to set a password |
| GET / PATCH | `/me` | any | profile + `permissions` (staff) + `deletionScheduledFor` |
| GET | `/me/sessions` · DELETE `/me/sessions/:id` | any | |
| POST | `/me/password` | any | change password (replaces planned `/auth/password/change`) |
| POST | `/me/verification/send` · `/me/verification/verify` | student | `channel: email | phone` (phone requires setting + SMS provider) |
| POST / DELETE | `/me/deletion` | student | request / cancel self-service deletion |
| POST | `/admin/auth/login` · `/admin/auth/refresh` · `/admin/auth/logout` | public/staff | requires header `X-TK-Client: admin`; refresh token in HttpOnly cookie `tk_admin_rt` |
| GET | `/admin/permissions` | `roles:manage` | catalog |
| GET / POST | `/admin/roles` · PUT / DELETE `/admin/roles/:id` | `roles:manage` | cannot grant permissions you lack; Super Admin role protected |
| GET | `/admin/staff` | `staff:read` | |
| POST | `/admin/staff` | `staff:manage` | creates staff without password + emails setup code |
| PUT | `/admin/staff/:id/roles` | `staff:manage` | last Super Admin protected |
| PATCH | `/admin/staff/:id/suspend` · `/admin/staff/:id/reactivate` | `staff:manage` | |
| GET | `/admin/users` · `/admin/users/:id` | `users:read` | search `q`, `status`, cursor pagination |
| PATCH | `/admin/users/:id` | `users:update` | `deviceLimitOverride` |
| POST | `/admin/users/:id/suspend` · `/reactivate` · `/revoke-sessions` | `users:suspend` | |
| GET | `/admin/settings` · PUT `/admin/settings/:key` | `settings:read` / `settings:update` | validated per key, audited |
| GET | `/admin/audit-logs` | `audit:read` | filters + cursor; each entry includes `actor { id, fullName, email, kind }` |
| POST | `/admin/auth/login/mfa` | public | `{ mfaToken, code }` (6-digit TOTP or recovery code) after login returned `{ mfaRequired: true, mfaToken }` |
| GET / POST / DELETE | `/admin/me/mfa` · `/admin/me/mfa/setup` · `/admin/me/mfa/enable` | staff | own 2FA status, setup (secret + otpauth URL), enable (returns 10 recovery codes once), disable (requires code) |
| GET | `/admin/dashboard` | `users:read` | headline student/staff counts |
| GET | `/education-levels` | public | active levels, ordered |
| GET / POST | `/admin/education-levels` · PUT / DELETE `/admin/education-levels/:id` · PUT `/admin/education-levels/order` | `education_levels:manage` | bilingual names, in-use delete blocked |

## 1b. Implemented endpoints (Phase 6 — content) ✅

Publish workflow (D-036, T-026): `content:edit` / `courses:edit` may set `draft` or `in_review`; `published`,
`scheduled` (needs future `publishAt`) and `archived` need `content:publish` / `courses:publish`, and so does editing
anything already live. Deletes are soft; `restore` brings rows back. Scoped staff (T-028) only reach assigned
courses/subjects. Every write is audited.

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/admin/media` | `media:manage` | multipart `file` + `visibility`, `altText`; type sniffed; images → WebP variants; PDFs always private |
| GET | `/admin/media` · `/admin/media/:id` | `media:manage` or content/course edit | list (kind, search, cursor) / detail with signed URL for private files |
| PATCH / DELETE | `/admin/media/:id` | `media:manage` | alt text; delete blocked while referenced |
| GET | `/public-media/*` | public | **dev only** (`PUBLIC_MEDIA_PROXY=true`); production serves the public bucket from the CDN |
| GET / POST | `/admin/exam-nodes` · PUT `/admin/exam-nodes/:id` · PUT `/admin/exam-nodes/order` | `taxonomy:manage` | authority → category → post tree, bilingual |
| PUT / DELETE | `/admin/exam-nodes/:id/status` · `/admin/exam-nodes/:id` · POST `…/restore` | `taxonomy:manage` | |
| GET / POST | `/admin/papers` · PUT / DELETE `/admin/papers/:id` · PUT `/admin/papers/:id/status` | `taxonomy:manage` | papers with marks/duration, linked to posts |
| GET / POST | `/admin/subjects` · GET `/admin/subjects/:id/tree` · PUT `/admin/subjects/:id` | `content:edit` (read: also `content:publish`, `courses:edit`) | tree = chapters → topics → items |
| POST | `/admin/subjects/:id/chapters` · `/admin/chapters/:id/topics` · `/admin/topics/:id/items` | `content:edit` | items: `note` (rich text), `pdf` (media id), `video` (YouTube URL or Bunny id) |
| PUT | `…/chapters/order` · `…/topics/order` · `/admin/topics/:id/items/order` | `content:edit` | ids must be exactly the current children |
| PUT / DELETE / POST | `/admin/{subjects,chapters,topics}/:id` (+ `/status`, `/restore`) | `content:edit` | |
| GET / PUT / DELETE / POST | `/admin/learning-items/:id` (+ `/publishing`, `/restore`) | `content:edit` | `publishing`: `{ status, publishAt? }` |
| GET / POST | `/admin/courses` · GET / PUT `/admin/courses/:id` | `courses:edit` (read: any course permission) | |
| PUT | `/admin/courses/:id/pricing` | `courses:pricing` | paisa; sale window; validity `days` / `fixed_date` / `lifetime` |
| PUT | `/admin/courses/:id/subjects` · `/admin/courses/:id/links` | `courses:edit` | display marks per subject; exam nodes + instructors |
| PUT / DELETE / POST | `/admin/courses/:id/publishing` · `/admin/courses/:id` · `…/restore` | `courses:edit` (+ `courses:publish`) | delete blocked while active entitlements exist (T-027) |
| GET / PUT | `/admin/instructors` · `/admin/instructors/:userId` | `instructors:manage` | public instructor profile |
| GET / PUT | `/admin/staff/:id/scopes` | `staff:read` / `staff:manage` | course/subject scopes (T-028) |
| GET / POST | `/admin/users/:id/entitlements` · POST `/admin/entitlements/:id/revoke` | `entitlements:grant` (read: `users:read`) | admin grants until payments (Phase 13); never deleted |
| GET | `/exam-nodes` | public | live taxonomy tree |
| GET | `/courses` · `/courses/:slug` | public (optional auth) | prices hidden for `X-TK-Platform: ios` and for `android` unless the in-app channel is on (D-027); detail adds `access: { entitled }` when signed in; archived courses visible only to entitled students |
| POST | `/courses/:courseId/enrol` | student | free (price 0) live courses only (D-043): 201 `{ enrolled: true, endsAt }`, 200 if already enrolled; 409 `ENROLMENT_NOT_AVAILABLE` (`reason: not_free \| access_period_ended`); course detail exposes `access.canEnrol` |
| GET | `/me/courses` | student | courses with an active entitlement, incl. archived ones (T-027) |
| GET | `/courses/:courseId/subjects/:subjectId/outline` | student | chapters/topics/items with `locked` flags; no premium bodies |
| GET | `/learning-items/:id` | student | `CONTENT_LOCKED` (403) without access; `VERIFICATION_REQUIRED` when the setting demands it |
| GET | `/learning-items/:id/pdf` | student | streamed PDF, watermarked per student (T-029) |
| GET | `/learning-items/:id/playback` | student | YouTube nocookie embed or signed, expiring Bunny embed; `VIDEO_PROVIDER_NOT_CONFIGURED` (503) without Bunny credentials |

## 1c. Implemented endpoints (Phase 7 — question bank) ✅

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/admin/questions` | `questions:edit` / `questions:publish` / `assessments:edit` | filters `q` (stem/options text), `subjectId`, `topicId`, `type`, `difficulty`, `status`, `tag`, `pyq`, cursor; scoped staff see their subjects only |
| POST / PUT | `/admin/questions` · `/admin/questions/:id` | `questions:edit` | body `QuestionInput` (metadata + `content` per type); content change ⇒ new immutable version; type cannot change; editing a published question needs `questions:publish` |
| GET | `/admin/questions/:id` · `/admin/questions/:id/versions` | as list | current content + version history |
| PUT | `/admin/questions/:id/status` | `questions:edit` (+ `questions:publish` for published/archived) | draft / in_review / published / archived |
| DELETE / POST | `/admin/questions/:id` · `…/restore` | `questions:publish` | soft delete |
| GET | `/admin/question-tags?q=` | as list | tag suggestions with counts |
| GET / POST / PUT | `/admin/question-groups` · `/admin/question-groups/:id` | `questions:edit` | passages for comprehension questions |
| GET / PUT | `/admin/question-reports?status=` · `/admin/question-reports/:id` | `question_reports:manage` | resolve or reject with a note |
| POST | `/admin/question-imports` | `questions:edit` | multipart `file` (.xlsx ≤ 5 MB, ≤ 2,000 rows) → preview `{ id, summary, fileProblems, rows[{ row, ref, type, preview, problems[{column,message}], warnings }] }`; names resolved (subject, chapter/topic, category path, paper, passage); nothing saved |
| POST | `/admin/question-imports/:id/commit` | `questions:edit` (uploader only) | creates the ready rows + passages as drafts in one transaction; 409 if already confirmed, older than 24 h, or references changed |
| GET | `/admin/question-imports` | `questions:edit` | your 20 most recent imports |
| GET | `/admin/questions/import-template` | `questions:edit` | `.xlsx` template `tk-questions-v1` with dropdowns filled from the LMS (subjects, category paths, papers) |
| GET / POST / PUT / DELETE | `/admin/exam-node-types` · `/admin/exam-node-types/:key` | read: taxonomy/course/question/assessment editors; write: `taxonomy:manage` | admin-managed category types; key permanent; rank/flag changes refused (409) if existing categories would break; in-use types cannot be deleted |
| GET | `/exam-node-types` | public | active category types (key, name, rank) for app labels |
| POST | `/questions/:id/reports` | student | published questions only; one open report per student per question (409) |

## 2. Public / app bootstrap
| Method | Path | Notes |
|---|---|---|
| GET | `/app/config` | min app versions, maintenance, purchase channels per platform, verification channels, feature flags, support contacts |
| GET | `/health/live`, `/health/ready` | ops |

## 3. Auth & account
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | name, email, password, locale, acceptTerms |
| POST | `/auth/login` | email, password, device info → tokens or `DEVICE_LIMIT_REACHED` |
| POST | `/auth/google` | idToken, device info |
| POST | `/auth/refresh` | rotate refresh token |
| POST | `/auth/logout` | revoke current session |
| POST | `/auth/otp/send` | purpose (verify_email/verify_phone/reset_password), target |
| POST | `/auth/otp/verify` | purpose, code |
| POST | `/auth/password/reset` | resetToken (from OTP verify), newPassword |
| POST | `/auth/password/change` | current, new |
| GET/DELETE | `/me/sessions`, `/me/sessions/:id` | device management |
| GET/PATCH | `/me` | profile incl. education level, DOB, phone (re-verify) |
| POST | `/me/avatar` | presigned flow |
| PUT | `/me/target-posts` | onboarding |
| POST/DELETE | `/me/deletion` | request / cancel deletion |
| GET/PUT | `/me/notification-preferences` | |
| POST/DELETE | `/me/push-tokens` | register / unregister |

## 4. Catalog & taxonomy
| Method | Path | Notes |
|---|---|---|
| GET | `/home` | CMS-driven sections for the user (banners, current course, continue, daily challenge, notices, popular) |
| GET | `/exam-nodes?parentId=&type=` | category/post browsing |
| GET | `/courses?examNodeId=&q=&sort=&featured=` | |
| GET | `/courses/:slug` | detail (prices omitted for iOS when web-only) |
| GET | `/courses/:id/subjects` | with display marks/duration |
| GET/POST | `/courses/:id/reviews` | |
| GET | `/me/courses` | entitled courses + progress |
| GET | `/instructors/:id` | public profile |

## 5. Learning
| Method | Path | Notes |
|---|---|---|
| GET | `/subjects/:id/outline?courseId=&type=notes|videos|questions|quizzes` | chapters → topics with counts/durations, progress, lock state |
| GET | `/learning-items/:id` | note body / pdf meta / video meta (access-checked) |
| GET | `/learning-items/:id/pdf` | short-lived signed URL (watermarked stream for download) |
| GET | `/learning-items/:id/playback` | Bunny signed HLS URL or YouTube id |
| PUT | `/learning-items/:id/progress` | position, pct, completed |
| GET | `/topics/:id/questions?type=` | practice questions (answers only if entitled) |
| POST | `/questions/:id/reports` | |
| GET/POST/DELETE | `/me/bookmarks` | |
| GET | `/me/mistakes`, PATCH `/me/mistakes/:id` | |
| GET/POST | `/discussions?anchorType=&anchorId=`, `/discussions/:id/posts` | |

## 6. Assessments
| Method | Path | Notes |
|---|---|---|
| GET | `/assessments?type=&courseId=&state=upcoming|live|completed` | |
| GET | `/assessments/:id` | rules, eligibility, attempts used |
| POST | `/assessments/:id/attempts` | start (Idempotency-Key) → attempt with question plan (no answers), `deadlineAt`, `serverNow` |
| GET | `/attempts/:id` | resume |
| PUT | `/attempts/:id/answers` | batch upsert `{questionId, response, markedForReview}[]` |
| POST | `/attempts/:id/submit` | idempotent |
| GET | `/attempts/:id/result` | per release policy; solutions/explanations if allowed |
| POST | `/attempts/:id/self-grade` | subjective self-evaluation |
| GET | `/assessments/:id/leaderboard` | if enabled and released |
| GET | `/daily-challenge/today`, `/me/streak` | |
| GET | `/me/attempts`, `/me/analytics` | history & analytics |
| GET | `/me/certificates`, public `GET /certificates/verify/:code` | |
| GET/POST | `/me/study-plan` | |

## 7. Content & communication
| Method | Path | Notes |
|---|---|---|
| GET | `/articles?kind=&period=&categoryId=&courseId=` / `/articles/:id` | current affairs, Gorkhapatra summaries, news, blog |
| GET | `/notices?kind=` / `/notices/:id` | audience-filtered |
| GET | `/me/notifications`, POST `/me/notifications/read` | inbox |
| GET | `/pages/:slug`, `/faqs`, `/contact-options` | |
| GET | `/search?q=&types=` | unified search |

## 8. Commerce & payments
| Method | Path | Notes |
|---|---|---|
| GET | `/plans` | (hidden prices on iOS web-only) |
| POST | `/coupons/validate` | |
| POST | `/orders` | items, couponCode, channel → server-priced order |
| GET | `/orders/:id`, `/me/orders` | status polling |
| POST | `/orders/:id/payments` | provider → redirect payload (eSewa signed form / Khalti payment_url) |
| GET | `/payments/esewa/return` | success/failure redirect handler → verify → deep link/web redirect |
| GET | `/payments/khalti/return` | return_url handler → lookup → redirect |
| GET | `/me/invoices/:id` | PDF |
| GET/POST | `/me/referral` | |

## 9. Admin (`/admin/*`, staff audience, permission-guarded)

Every module exposes `GET list` (search/filter/sort/paginate), `GET :id`, `POST`, `PATCH :id`, `DELETE :id` (soft),
`POST :id/restore`, `POST :id/submit-review`, `POST :id/publish`, `POST :id/unpublish`, `POST bulk`, plus specifics:

- `/admin/roles`, `/admin/staff`, `/admin/users/:id/(entitlements|sessions|attempts)`, `/admin/users/:id/grant`
- `/admin/exam-nodes` (+ `move`, `reorder`), `/admin/papers`
- `/admin/courses` (+ subjects, instructors, pricing), `/admin/subjects|chapters|topics` (+ `reorder`, `duplicate`)
- `/admin/learning-items`, `/admin/media` (presign/confirm), `/admin/videos` (Bunny upload session, YouTube import)
- `/admin/questions` (+ versions), `/admin/question-imports` (upload → validate → preview → commit), `/admin/question-reports`
- `/admin/assessments` (+ sections, preview generation), `/admin/grading-queue`, `/admin/assessments/:id/release-results`
- `/admin/articles`, `/admin/notices`, `/admin/notification-campaigns`, `/admin/banners`, `/admin/home-sections`
- `/admin/plans`, `/admin/coupons`, `/admin/orders`, `/admin/payments` (+ `reconcile`), `/admin/refunds` (+ approve/process), `/admin/invoices`
- `/admin/reviews`, `/admin/discussions`, `/admin/faqs`, `/admin/pages`, `/admin/contact-options`, `/admin/certificates`
- `/admin/settings`, `/admin/audit-logs`, `/admin/dashboard` (KPIs), `/admin/reports/*` (exports CSV/XLSX)

## 10. Webhooks / provider endpoints
| Path | Notes |
|---|---|
| `/webhooks/bunny` | video encoding status (signature verified) |
| Payment returns (§8) | eSewa/Khalti use browser redirects; verification is always a server-to-server call |
