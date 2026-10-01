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
| GET | `/app/config` | public | maintenance, min versions, purchase channels, verification channels |
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
| GET | `/admin/audit-logs` | `audit:read` | filters + cursor |

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
