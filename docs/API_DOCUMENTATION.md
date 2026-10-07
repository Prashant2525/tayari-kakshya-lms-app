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
| GET | `/app/config` | public | maintenance, min versions, store links (`app.storeLinks`), purchase channels, verification channels, enabled question types + display names |
| POST | `/auth/register` | public | → tokens; sends email verification code if enabled |
| POST | `/auth/login` | public | optional `replaceSessionId` when `DEVICE_LIMIT_REACHED` |
| POST | `/auth/google` | public | ID token verified server-side |
| POST | `/auth/refresh` | public | rotation; reuse ⇒ session revoked (`REFRESH_TOKEN_REUSED`) |
| POST | `/auth/logout` | student | revokes current session |
| POST | `/auth/password/forgot` | public | always 202 |
| POST | `/auth/password/reset` | public | `{ email, code, newPassword }`; revokes all sessions; also used by invited staff to set a password |
| GET / PATCH | `/me` | any | profile + `permissions` (staff) + `deletionScheduledFor` + `analyticsId` (pseudonym for product analytics, T-042) |
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
| GET | `/exam-nodes?parentId=&type=` | public | published children of a category (roots without `parentId`), each with `childCount` (published children) for level-by-level browsing |
| GET / PUT | `/me/target-posts` | student | onboarding (S1): PUT `{ examNodeIds }` (≤ 5, unique, published with published ancestors) replaces the list; returns each with its ancestor `path`; unpublished choices are hidden |
| GET | `/courses` · `/courses/:slug` | public (optional auth) | prices hidden for `X-TK-Platform: ios` and for `android` unless the in-app channel is on (D-027); detail adds `access: { entitled }` when signed in; archived courses visible only to entitled students |
| POST | `/courses/:courseId/enrol` | student | free (price 0) live courses only (D-043): 201 `{ enrolled: true, endsAt }`, 200 if already enrolled; 409 `ENROLMENT_NOT_AVAILABLE` (`reason: not_free \| access_period_ended`); course detail exposes `access.canEnrol` |
| GET | `/me/courses` | student | courses with an active entitlement, incl. archived ones (T-027), each with `progress { completed, total }` (T-039) |
| GET | `/me/continue` | student | `{ next }`: the last unfinished item the student can still open, with its subject and the course it was opened from (or `null`) |
| PUT | `/learning-items/:id/progress` | student | `{ courseId?, position?, completed?: true }` — same access rules as opening the item; completion is permanent; the subject outline now includes `progress` per item |
| GET | `/viewer/pdf` · `/viewer/assets/*` | public (no data) | self-hosted PDF reader page and allow-listed pdf.js files (T-038); the PDF itself still needs the student's token |
| GET | `/courses/:courseId/subjects/:subjectId/outline` | student | chapters/topics/items with `locked` flags; no premium bodies |
| GET | `/learning-items/:id` | student | `CONTENT_LOCKED` (403) without access; `VERIFICATION_REQUIRED` when the setting demands it |
| GET | `/learning-items/:id/pdf` | student | streamed PDF, watermarked per student (T-029) |
| GET | `/learning-items/:id/playback` | student | YouTube nocookie embed or signed, expiring Bunny embed; `VIDEO_PROVIDER_NOT_CONFIGURED` (503) without Bunny credentials |

## 1b-2. Implemented endpoints (Phase 9 part 2 — practice, bookmarks, search) ✅

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/courses/:courseId/subjects/:subjectId/questions?chapterId=&topicId=&cursor=&limit=` | student | published practice questions of a subject the course contains, paged by id: `{ id, type, marks, difficulty, isPyq, year, accessLevel, locked, question, answer, passage, media }`. `question` never contains answer keys; `answer` (keys, model answer, explanation) is **`null` when locked** (premium without access — rule 5). 404 for a subject outside the course; `VERIFICATION_REQUIRED` when the setting demands it |
| GET | `/practice-questions/:id` | student | one question with the same lock rule (404 if unpublished) |
| GET | `/me/bookmarks` | student | saved lessons and questions, newest first: `{ targetType, targetId, createdAt, item? \| question? }`; unpublished targets are left out |
| PUT / DELETE | `/me/bookmarks/:type/:id` | student | `type` = `learning_item` \| `question`; save (idempotent) / remove; only published targets can be saved |
| GET | `/search?q=` | student | `q` 2–120 chars: `{ courses, items, questions }` — published courses (platform-aware prices), lessons by title (en/ne), questions by text; no premium bodies or answers |

## 1b-3. Implemented endpoints (§10 part 1 — taking assessments) ✅

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/assessments?courseId=&subjectId=&type=` · `/assessments?mine=true` | student | live assessments of a course (course-level or its subjects'), one subject, or the student's exams (target categories and their parents) and courses; daily challenges excluded. Each: `locked` (D-048 premium access), `state` (upcoming/open/closed), `questionCount`, `totalMarks` (centimarks; null when random questions differ), `attemptsUsed`, `inProgressAttemptId`, `result` (official attempt, when released) |
| GET | `/assessments/:id` | student | the same plus `instructions`, `rules` (negative marking, pass marks, result release + date, explanations, written-answer grading, official attempt, late start) and `attempts` (`counted` = official) |
| POST | `/assessments/:id/attempts` | student | start, or resume the unfinished attempt (200 either way; concurrent starts get the same attempt). 403 `CONTENT_LOCKED` / `VERIFICATION_REQUIRED`; 409 `ASSESSMENT_NOT_AVAILABLE` (`reason`: not_open, closed, no_attempts_left, not_ready). Returns the attempt view |
| GET | `/attempts/:id` | owner | questions without answers, saved responses, `deadlineAt`, `serverNow`; finishes the attempt first when its time (+ grace) is over |
| PUT | `/attempts/:id/answers` | owner | `{ answers: [{ questionId, response \| null, markedForReview }] }` (≤ 500); the response type must match the question; 409 `ATTEMPT_CLOSED` once submitted or after deadline + grace (which also submits it) |
| POST | `/attempts/:id/submit` | owner | idempotent; returns the result |
| GET | `/attempts/:id/result` | owner | `released` false → no scores, answers or solutions (`releaseAt` when known); released → `summary` (centimarks), per-section breakdown, every question with response, `answer` (keys; explanation only if the assessment shows explanations), `outcome`, `awarded`; `counted`; `canSelfGrade` |
| POST | `/attempts/:id/self-grade` | owner | `{ grades: [{ questionId, awarded }] }` for written answers awaiting marks (self-graded assessments, after release); ≤ the question's marks |
| GET | `/me/attempts?cursor=&limit=` | student | history, newest first; scores only when released |

Admin: `AssessmentInput` gains optional `premiumAccess` (linked/any_course/plans_only), `lateStart` (until_close/full_duration), `countedAttempt` (first/best/latest) — omitted = the `assessments.defaults` setting; detail returns them. Settings: `assessments.defaults` gains the three defaults; new `assessments.timing { graceSeconds }`.

## 1b-4. Implemented endpoints (§10 part 2 — grading and results) ✅

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/admin/grading?assessmentId=&limit=` | `grading:manage` (scoped) | written answers awaiting marks in instructor-graded assessments, oldest submission first: attempt, question (stem), answer (model answer), student name, response, max marks (centimarks); `total` and the assessments with answers waiting |
| PUT | `/admin/attempts/:attemptId/answers/:questionId/grade` | `grading:manage` (scoped) | `{ awarded, comment? }` — written answers only, 0 … max; also corrects earlier marks; recomputes totals and pass/fail; audited `attempt.grade`; 409 while the attempt runs; 400 for unanswered or auto-scored questions |
| GET | `/admin/assessments/:id/attempts?cursor=&limit=` | `assessments:edit` / `assessments:publish` / `grading:manage` (scoped) | release state, statistics (attempts, students, in progress, awaiting marks, average and passes over official attempts) and attempts (student, number, status, score, official) |
| GET | `/admin/attempts/:id` | as above | every question with response, answer key, outcome, marks, grader and comment |
| POST | `/admin/assessments/:id/release-results` | `assessments:publish` (scoped) | manual release (one-way, audited `assessment.results_release`); 409 for assessments that release automatically |

Students: released results include `graderComment` on written answers.

## 1c-11. Implemented endpoints (Phase 11 part 1 — course purchase) ✅

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/payments/options` | student | `{ providers: [{ provider: esewa / khalti, testMode }] }` — configured, switched on, and the platform can buy (`X-TK-Platform`) |
| POST | `/orders` | student | `{ courseId }` → 201 order (server price; the unpaid one is reused). 409 `PURCHASE_NOT_AVAILABLE` (`channel_closed`, `already_has_access`, `free_course`, `not_for_sale`, `access_period_ended`) |
| POST | `/orders/:id/pay` | student | `{ provider, returnTo: app / web }` → `{ paymentId, redirectUrl }`. 409 `ORDER_CLOSED`, 409 `PAYMENT_PROVIDER_UNAVAILABLE`, 502 `PAYMENT_GATEWAY_ERROR` |
| GET | `/orders/:id` | student (own) | order with items and payments; an open payment is checked with its gateway first (≤ every 5 s) |
| GET | `/me/orders` | student | orders that were paid or had a payment, newest first |
| GET | `/payments/esewa/:paymentId/start` | public | HTML page posting the signed form to eSewa (CSP: one script hash, `form-action` eSewa only); 404 once used / closed |
| GET | `/payments/esewa/return?data=` / `?payment=` | public | signature-checked, confirmed with eSewa's status API → 302 to the allow-listed return address with `?order=` (400 page for unknown / forged) |
| GET | `/payments/khalti/return?pidx=` | public | looked up with Khalti → 302 as above |
| GET | `/admin/orders?q=&status=&provider=&attention=true&cursor=&limit=` | `orders:read` | `q` = order number (`#123`), student name or email; `attention` = duplicate or amount mismatch |
| GET | `/admin/orders/:id` | `orders:read` | items (with validity bought), access given, payments with every gateway event |
| POST | `/admin/payments/:id/check` | `orders:manage` | asks the gateway again and settles; audited `payment.check` |

Setting `payments.providers { esewa, khalti }`. Migration `commerce`. Worker job `payments-reconcile` (every minute).

## 1c-11b. Implemented endpoints (Phase 11 part 2a — plans, T-050) ✅

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/plans` | optional | live plans: name, description, features, coverage, courses, validity, `pricing` (null on iOS / closed channels or price 0), `isFree`, `mine { endsAt }` for a signed-in student |
| POST | `/orders` | student | `{ planId }` (exactly one of `courseId` / `planId`) → order at the plan's price; renewal allowed while active (D-054); 409 `PURCHASE_NOT_AVAILABLE` `not_for_sale` (price 0), `already_has_access` (lifetime plan held) |
| GET | `/admin/plans` | `plans:manage` | list with course count, price, active subscribers, status |
| POST | `/admin/plans` | `plans:manage` | `{ slug, name, description, features[], coverage, isFeatured, sortOrder }` → 201 draft (409 slug taken) |
| GET / PUT | `/admin/plans/:id` | `plans:manage` | detail (pricing, course ids, subscribers) / update details |
| PUT | `/admin/plans/:id/pricing` | `plans:manage` | same body as course pricing |
| PUT | `/admin/plans/:id/courses` | `plans:manage` | `{ courseIds }` — applies to current subscribers at once |
| PUT | `/admin/plans/:id/status` | `plans:manage` | `{ status, publishAt? }` |

Order items now carry `kind` (course / plan), `planId` and `planSlug`. Migration `plans`.

## 1c-11c. Implemented endpoints (Phase 11 part 2b — coupons and VAT, T-051) ✅

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/orders/quote` | student | `{ courseId | planId, couponCode? }` → `{ kind, title, validity, regularPricePaisa, subtotalPaisa, discountPaisa, coupon, tax, totalPaisa }`; nothing stored. 422 `COUPON_NOT_VALID` (`details.reason`: not_found, inactive, not_started, ended, used_up, already_used, not_applicable, below_minimum, on_sale); 409 `PURCHASE_NOT_AVAILABLE` as for orders |
| POST | `/orders` | student | now also `couponCode`; a total of Rs 0 returns the order already **paid** (no payment, D-056) |
| GET | `/orders/:id`, `/me/orders` | student | orders carry `subtotalPaisa`, `discountPaisa`, `couponCode`, `tax { rateBps, inclusive, paisa }` |
| GET | `/admin/coupons?q=&state=active|inactive&cursor=&limit=` | `coupons:manage` | with paid uses |
| POST | `/admin/coupons` | `coupons:manage` | `CouponInput` → 201 (409 code taken) |
| GET / PUT | `/admin/coupons/:id` | `coupons:manage` | detail (targets, uses, waiting orders, recent orders, `shareBaseUrl`) / update (audited `coupon.update`) |

Setting `commerce.tax { vatRegistered, rateBps, pricesIncludeVat, businessName, panNumber, address }`. Migration `coupons_tax`. Env `PUBLIC_WEB_URL` (share links).

## 1c-11d. Implemented endpoints (Phase 11 part 3 — receipts and refunds, T-052) ✅

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/orders/:id`, `/me/orders` | student | orders carry `receipt { number }` once paid; status may be `refunded` |
| GET | `/orders/:id/receipt` | student (own) | `{ path, expiresAt }` — a signed path under the API base, valid 10 minutes; 404 when not paid or not yours |
| GET | `/receipts/:id/pdf?exp=&sig=` | public (signed) | the receipt PDF; 404 for a changed or expired link |
| GET | `/admin/orders/:id` | `orders:read` | now with `receipt { number, issuedAt, email }` and `refunds[]` |
| POST | `/admin/orders/:id/refunds` | `refunds:request` | `{ amountPaisa, reason }` → 201; 409 `CONFLICT` reason `not_paid`, `nothing_paid`, `exceeds_paid` |
| GET | `/admin/refunds?status=&cursor=&limit=` | `orders:read` | the refund queue |
| POST | `/admin/refunds/:id/approve` / `reject` | `refunds:approve` | `{ note }`; approve of the remaining amount refunds the order and removes its access; 409 `already_decided` |
| POST | `/admin/refunds/:id/complete` | `refunds:approve` | `{ reference, note }` — money sent; 409 `not_approved` |

Setting `commerce.receipts { prefix, resetEachFiscalYear }`. Migration `receipts_refunds`. Worker job `receipts-email`.

## 1c-11e. Implemented endpoints (Phase 11 part 4b — referrals, T-054) ✅

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/auth/register`, `/auth/google` | public | now `referralCode?` (only when the account is created); 422 `REFERRAL_CODE_NOT_VALID` for an unknown code (password sign-up) |
| GET | `/app/config` | public | `referrals { enabled }` |
| GET | `/me/referral` | student | `{ enabled, code, link, friendDiscount, reward, joined, rewarded, rewards[{ code, …discount, endsAt, state }] }` |
| POST | `/orders/quote`, `/orders` | student | quote adds `referral { discountPaisa }` and `couponSkipped`; orders carry `referralDiscount` |
| GET | `/admin/referrals?status=&cursor=&limit=` | `orders:read` | referrer, friend, first purchase, reward coupon |

Setting `referrals.rules`. Migration `referrals`.

Access change (D-053): premium items, practice answers, mistake-notebook answers and Premium tests are unlocked only by
paid access (`order`), staff grants, coupons or referrals — not by `free_enrol`. `access.entitled` on a course still
means "in My courses" (free enrolments included).

## 1b-8. Changes (§10 hardening)

`PUT /attempts/:id/answers` accepts `clientSavedAt` (epoch ms, optional): an answer from a batch older than the one
that set it is skipped (T-048). Migration `answer_client_time`.

## 1b-7. Implemented endpoints (§10 part 3c — mistake notebook) ✅

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/practice-questions/:id/check` | student | `{ response }` → `{ outcome, addedToNotebook }`; scored on the server; 400 for written answers or a response of another type; 403 `CONTENT_LOCKED` without access; 600 per user per hour |
| GET | `/me/mistakes?subjectId=&cursor=&limit=` | student | active questions, newest mistake first: `{ data: [{ questionId, timesWrong, correctStreak, lastWrongAt, lastSource, subject, question }], nextCursor, required, media }`; `question` is the practice view (answer null when locked) |
| GET | `/me/mistakes/summary` | student | `{ active, mastered, required, subjects: [{ id, name, count }] }` |
| POST | `/me/mistakes/:questionId/review` | student | `{ response }` or, for written answers, `{ selfCorrect }` → `{ outcome, correctStreak, required, mastered }`; 404 when not in the notebook; 403 when locked |
| DELETE | `/me/mistakes/:questionId` | student | 204; 404 when not in the notebook |

Reading the notebook first adds the mistakes of completed attempts whose results are now released. Setting
`mistakes.revision { correctInARow }` (1–10, default 2). Migration `mistakes`.

## 1b-6. Implemented endpoints (§10 part 3b — certificates) ✅

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/me/certificates` | student | issues any earned first; `[{ id, code, course: { id, slug, title }, issuedAt, revoked }]`, newest first |
| GET | `/certificates/:code` | public | `{ code, status: valid / revoked, holderName, courseTitle, issuerName, language, issuedAt, revokedAt }`; 404 unknown; dashes, case, O/0 and I/L/1 ignored; 120 per IP per hour |
| GET | `/certificates/:code/pdf` | public | `application/pdf` (inline); 410 `CERTIFICATE_REVOKED`; 60 per IP per hour |
| GET | `/admin/certificate-templates` | `certificates:manage` or `courses:edit` | `[{ id, name, language, requiredPercent, active, courseCount, issuedCount, updatedAt }]` |
| POST | `/admin/certificate-templates` | `certificates:manage` | `CertificateTemplateInput` → 201 `{ id }` |
| GET / PUT | `/admin/certificate-templates/:id` | `certificates:manage` | detail + `courses`; PUT returns the detail |
| GET | `/admin/certificate-templates/:id/preview` | `certificates:manage` | sample PDF |
| PUT | `/admin/courses/:id/certificate` | `certificates:manage` or `courses:edit` (+ course scope) | `{ templateId }` (null = no certificate) |
| GET | `/admin/certificates?q=&status=&courseId=&cursor=&limit=` | `certificates:manage` | `q` = student name, email or certificate number; `status` valid / revoked; scoped staff see their courses only |
| POST | `/admin/certificates/:id/revoke` | `certificates:manage` | `{ reason }` (3–500) → 204; 409 when already revoked |
| POST | `/admin/certificates/:id/reinstate` | `certificates:manage` | 204; 409 when not revoked |

Changes: `PUT /learning-items/:id/progress` adds `newCertificates: [{ id, code, course: { id, title } }]` (issued by
this call); `GET /courses/:slug` adds `access.certificate: { requiredPercent, progress: { completed, total }, earned:
{ id, code, revoked } or null } or null`; admin course detail adds `certificateTemplateId`. Setting
`certificates.verification { baseUrl }` (https, no trailing /). Migration `certificates`.

## 1b-5. Implemented endpoints (§10 part 3a — daily challenge, streaks, leaderboards) ✅

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/daily-challenge/today` | student | `{ today, challenge (summary or null), streak: { current, longest, doneToday } }` — Nepal day |
| GET | `/daily-challenges?cursor=&limit=` | student | earlier challenges, newest first; `pastAsPractice` |
| GET | `/me/streak` | student | `{ current, longest, doneToday }` (current is 0 once a day is missed) |
| GET | `/assessments/:id/leaderboard` | student | 404 when the assessment has no leaderboard; `released` false before results are released; `{ total, names, me: { rank, score, timeTakenSeconds }, top: [{ rank, name, me, score, timeTakenSeconds }] }` (≤ 50; empty with names `none`) |

Changes: attempt start on a daily challenge — before its day 409 `not_open`; after its day a practice attempt (or 409 `closed` when the CMS turns practice off). Summaries add `challengeDate`, `leaderboardEnabled`; attempts and results add `practice`; results add `rank: { rank, total } | null`. Settings: `leaderboards.display { names }`, `dailyChallenge.rules { pastAsPractice }`. Admin results: practice attempts excluded from statistics and official attempts, marked `practice`.

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

## 1d. Implemented endpoints (Phase 7 — assessments) ✅

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/admin/assessments` | `assessments:edit` / `assessments:publish` | filters `q`, `type`, `status`, `courseId`; scoped staff see their subjects/courses |
| GET | `/admin/assessments/defaults` | `assessments:edit` | prefill from setting `assessments.defaults` (scoring choices null until set) |
| POST / PUT | `/admin/assessments` · `/admin/assessments/:id` | `assessments:edit` | `AssessmentInput`: type, title, instructions, course/subject/chapter/topic/category links, access, availability window, duration, attempts, pass marks, **scoring choices (required, D-044)**, shuffling, result release, explanations, leaderboard, written-answer grading, daily-challenge day (one per day) |
| GET | `/admin/assessments/:id` | as list | details + sections + `readiness { ready, questions, totalMarks{min,max}, problems[], warnings[] }` |
| PUT | `/admin/assessments/:id/structure` | `assessments:edit` | replaces sections: fixed (question ids + marks overrides) or random (pool filter + count); section marks / negative marks |
| PUT | `/admin/assessments/:id/publishing` | `assessments:edit` (+ `assessments:publish` beyond review) | publish/schedule refused (400, `details.problems`) until readiness is clean |
| DELETE | `/admin/assessments/:id` | `assessments:publish` | soft delete |

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
| GET | `/courses/:courseId/subjects/:subjectId/questions` | practice questions (answers only if entitled) — implemented, §1b-2 |
| POST | `/questions/:id/reports` | |
| GET · PUT/DELETE | `/me/bookmarks` · `/me/bookmarks/:type/:id` | implemented, §1b-2 |
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
| GET | `/notices?cursor=&limit=` / `/notices/:id` | live, unexpired notices, pinned first (T-055); detail with media |
| GET / POST | `/me/notices/unseen`, `/me/notices/seen` | Notice tab badge: published since the tab was last opened |
| GET | `/me/notifications?cursor=&limit=`, `/me/notifications/unread` | inbox (category, title, body, link, read) and unread count |
| POST | `/me/notifications/read` `{ids}` | mark read (empty list = all) |
| GET / PUT | `/me/notification-preferences` | `{notice: {push, email}, course_update, exam_reminder, result, purchase}` |
| POST | `/me/push-tokens` `{token, platform}`, `/me/push-tokens/remove` `{token}` | Expo push token of this device |
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
- Notices (built, T-055): `GET|POST /admin/notices`, `GET|PUT|DELETE /admin/notices/:id`, `PUT /admin/notices/:id/status` — `notices:edit`; publishing and live edits need `notices:publish`
- `/admin/settings`, `/admin/audit-logs`, `/admin/dashboard` (KPIs), `/admin/reports/*` (exports CSV/XLSX)

## 10. Webhooks / provider endpoints
| Path | Notes |
|---|---|
| `/webhooks/bunny` | video encoding status (signature verified) |
| Payment returns (§8) | eSewa/Khalti use browser redirects; verification is always a server-to-server call |
