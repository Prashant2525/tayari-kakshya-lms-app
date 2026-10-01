# System Architecture

Status: **v1.0 draft for owner review** (Phase 3, 2026-10-02). Based on `DECISIONS.md` (D-001…D-042, T-001…T-015).

## 1. Context

```
                 ┌──────────────────────┐        ┌───────────────────────┐
 Students ──────▶│ Mobile app (Expo)    │        │ Public website (Next) │◀──── Visitors / iOS buyers
                 │ Android + iOS        │        │ courses, checkout,    │
                 └─────────┬────────────┘        │ legal, blog, certs    │
                           │ HTTPS /api/v1       └──────────┬────────────┘
 Staff ─▶ Admin CMS (Vite SPA) ───────────┐                 │
                                          ▼                 ▼
                        ┌──────────────────────────────────────────────┐
  Nepal VPS (Docker     │ Caddy (TLS, reverse proxy, static admin)     │
  Compose, D-037)       │ ├─ api      NestJS (Fastify) — stateless     │
                        │ ├─ worker   NestJS — BullMQ processors/cron  │
                        │ ├─ web      Next.js                          │
                        │ ├─ postgres PostgreSQL 17                    │
                        │ └─ redis    Redis 7                          │
                        └───────┬───────────────┬───────────────┬──────┘
                                │               │               │
          Cloudflare R2 (files) │   Bunny Stream (premium video)│  eSewa / Khalti (/ConnectIPS later)
          YouTube (free video)  │   Expo Push → FCM/APNs        │  Email provider, SMS provider
                                └── Sentry, PostHog, uptime monitor
```

## 2. Repository layout (pnpm + Turborepo, T-014)

```
apps/
  api/            NestJS — HTTP API (also builds the worker entrypoint: src/worker.ts)
  admin/          React + Vite Admin CMS
  mobile/         Expo app (Expo Router)
  web/            Next.js public website
packages/
  contracts/      Zod schemas, enums, DTO types shared by all apps; OpenAPI-generated API client
  domain/         Pure TS business logic shared server/client where safe: scoring helpers, BS date utils,
                  money/VAT math, permission catalog — no I/O
  design-tokens/  Colors, typography, spacing, radii, motion → exported for RN, Tailwind (admin/web)
  i18n/           en/ne UI string catalogs + helpers
  config/         tsconfig, eslint, prettier presets
infra/
  docker/         docker-compose.dev.yml (postgres, redis, mailpit, minio), production compose, Caddyfile
  scripts/        backup/restore, seed, ops scripts
docs/             project memory and architecture documents
```

## 3. Backend (NestJS modular monolith)

One codebase, two processes: **api** (HTTP, stateless) and **worker** (BullMQ consumers + schedulers). Modules own their
tables and expose services; cross-module effects go through **domain events** (in-process event bus → BullMQ for anything
slow or external).

| Module | Responsibility |
|---|---|
| `auth` | Registration, login, Google, OTP (email/SMS), tokens, sessions/devices, device limit, password reset, deletion |
| `users` | Student profiles, education levels, preferences, onboarding target posts |
| `rbac` | Permission catalog (code), roles (DB), user roles, instructor scopes, guards |
| `taxonomy` | Exam nodes, papers |
| `catalog` | Courses, course subjects/instructors/exam links, instructors' public profiles, reviews |
| `content` | Subjects, chapters, topics, learning items (notes/PDF/video), media, watermarking |
| `video` | `VideoProvider` (Bunny, YouTube): upload/import, status sync, signed playback |
| `questions` | Question bank, types, versions, tags, import, reports, discussions |
| `assessments` | Assessment definitions, blueprints, attempts, autosave, submission, scoring, grading, results, leaderboards |
| `engagement` | Daily challenge, streaks, certificates, bookmarks, mistakes, study plans, referrals |
| `progress` | Learning progress, study time, analytics aggregates |
| `commerce` | Plans, prices, coupons, orders, entitlements, invoices, refunds |
| `payments` | `PaymentProvider` (eSewa, Khalti, later ConnectIPS), callbacks, verification, reconciliation |
| `cms-content` | Articles (current affairs/Gorkhapatra/news/blog), notices, banners, home sections, FAQs, static pages, contact options |
| `notifications` | Templates (en/ne), inbox, push tokens, Expo push, email, preferences, campaigns |
| `search` | Postgres FTS queries across entities |
| `settings` | Typed system settings, feature flags, app version/force-update, maintenance |
| `audit` | Audit log writer (interceptor + explicit calls) |
| `files` | Presigned uploads, validation, R2 access |
| `ai` (later) | Study assistant (S13) behind provider interface |

Cross-cutting: Zod validation pipe (schemas from `packages/contracts`), global exception filter with stable error codes,
Pino request logging with redaction, request IDs, rate limiting (Redis), Helmet-equivalent headers, CORS allow-list,
OpenAPI generation, health (`/health/live`, `/health/ready`).

## 4. Identity, sessions & RBAC

- **Passwords**: Argon2id. **Access token**: JWT, 15 min, claims `sub`, `sid` (session id), `aud` (`student`|`staff`), `ver`.
- **Refresh token**: opaque random 256-bit, stored **hashed** in `auth_sessions`; rotated on every use; reuse of an old token
  revokes the whole session family (theft detection).
- **Device limit (D-028)**: on login, count active sessions for the user; if at the limit, return `DEVICE_LIMIT_REACHED`
  with the device list so the user can sign one out (policy configurable: block vs. replace oldest).
- **Mobile storage**: refresh token in `expo-secure-store`; access token in memory only.
- **Admin CMS**: separate `staff` audience, refresh token in an `HttpOnly; Secure; SameSite=Strict` cookie scoped to
  `/api/v1/admin/auth`; CSRF defence = required `X-TK-Client: admin` header + CORS allow-list (T-018); optional TOTP 2FA
  (required for Super Admin — Phase 5, KI-014).
- **OTP**: 6 digits, hashed, 10-min expiry, 5 attempts, resend cooldown; purposes `verify_email`, `verify_phone`, `reset_password`.
- **Google**: verify ID token server-side (audience = our client IDs); link to existing account by verified email.
- **RBAC (D-036)**: permissions are code-defined strings `resource:action` (e.g. `course:update`, `course:publish`,
  `payment:refund`). Roles are DB rows created by the Super Admin; users can hold several roles. **Instructor scoping**:
  `staff_scopes` restrict a user's permissions to assigned courses/subjects. Super Admin role is system-protected
  (cannot be deleted/demoted; at least one must exist).

## 5. Content access & entitlements

```
canAccess(user, item):
  if item.status != published or not in schedule → deny (unless staff preview permission)
  if item.access_level == free → allow
  courses = courses that include item's subject
  allow if user has an ACTIVE entitlement where
        (scope = course and course_id ∈ courses) or (scope = plan and plan covers any of courses)
  ACTIVE = status active and starts_at ≤ now and (ends_at is null or ends_at > now)
```

- Evaluated server-side for every content/answer/video/PDF request; list endpoints return `locked: true` stubs (title,
  duration) without bodies/URLs/answers.
- Entitlements are created only by the commerce module (verified payment, admin grant, 100% coupon, referral reward) —
  never by clients. Expiry is computed on read; a nightly job marks expired rows and sends notices.

## 6. Payments (D-003, D-027)

```
Client → POST /orders {items, coupon, channel}           server prices items, applies coupon/VAT, creates order (pending, expires_at)
Client → POST /orders/:id/payments {provider}            server creates payment attempt; returns provider redirect data
          eSewa: signed form fields (HMAC-SHA256) → in-app browser POST to eSewa form URL
          Khalti: server calls /epayment/initiate → payment_url → in-app browser
Provider → redirect to API callback URL (success/failure)
API callback → record raw event (idempotency key) → verify with provider (eSewa status API / Khalti lookup)
            → check amount == order.total, product code/merchant, order not already paid
            → transaction: payment=completed, order=paid, entitlements created, invoice number allocated, audit
            → redirect to app deep link / website result page
Worker   → reconciliation job for pending/ambiguous payments (backoff schedule) and order expiry
```

- State machines — Order: `pending → paid | expired | cancelled | refunded | partially_refunded`.
  Payment: `initiated → pending → completed | failed | cancelled | expired | ambiguous → reconciled_*`, `refunded`.
- Unique constraints: `(provider, provider_reference)`; one `completed` payment per order (partial unique index).
- Client "success" screens only poll `GET /orders/:id`; the app never asserts success.
- Channel availability is a setting per platform (`purchase.channels.ios = web_only`) returned by `/app/config`; the iOS
  app renders no prices or purchase CTAs when web-only.
- Refunds: admin-approved; provider refund executed manually or via API where available; entitlements revoked; audit trail.
- Invoices: number allocated in the same transaction as payment completion (`invoice_counters` row lock, per fiscal year,
  prefix from settings); VAT computed from settings captured on the order snapshot.

## 7. Video (D-015)

- `video_assets.provider ∈ {bunny, youtube}`.
- **Bunny**: CMS uploads directly via tus/presigned upload to Bunny; webhook/poll updates status + duration. Playback
  endpoint returns a short-lived **token-signed HLS URL** after the access check. Offline: download allowed only for
  entitled users; stored in app sandbox; license re-checked online at least every N days (setting).
- **YouTube (unlisted)**: stores video ID; app plays with the YouTube IFrame player (no stream extraction, ToS-compliant).
  CMS shows a warning if a YouTube video is marked premium (IDs can leak).
- Android `FLAG_SECURE` / iOS capture detection on premium video & PDF screens (S20).

## 8. Assessment engine

- **Definition**: `assessments` + `assessment_sections` (blueprint: subject/chapter/difficulty filters, count, marks) +
  optional fixed `assessment_questions`. Rules are columns (duration, window, attempts, negative marking, pass mark,
  result release, leaderboard, shuffle, show explanations, subjective grading mode).
- **Start**: eligibility (access, window, attempts) → create attempt with frozen question list (question **version** ids,
  option order) and `deadline_at = min(started_at + duration, closes_at)`; schedule BullMQ delayed job `attempt.autoSubmit` at deadline + grace.
- **Answering**: `PUT /attempts/:id/answers` batched upserts (idempotent per question); rejected after deadline + grace.
  Client keeps a local queue (MMKV) and flushes on reconnect; timer UI derives from server `deadline_at` and server time offset.
- **Submit**: idempotent (`submitted_at` set once, `SELECT … FOR UPDATE`); scoring uses the frozen versions; objective types
  scored automatically via `packages/domain` scoring functions (unit-tested); subjective → `pending_grading` (self or instructor).
- **Results**: released per policy; rankings computed at release (dense rank by score, then time) into `assessment_rankings`.
- **Daily challenge**: an assessment with `type=daily_challenge` and a date; completion updates streaks (Asia/Kathmandu day boundary).

## 9. Notifications (D-033)

Domain events (`order.paid`, `course.updated`, `assessment.reminder`, `result.released`, `notice.published`) → notification
service → resolve audience + preferences → per channel jobs: **in-app** (insert inbox rows), **push** (Expo push, receipts
processed, invalid tokens pruned), **email** (provider, templated en/ne). Campaigns from CMS use the same pipeline.

## 10. Content, i18n and dates

- Localized fields stored as JSONB `{"en": "...", "ne": "..."}` validated by Zod (`LocalizedText`); API returns both or the
  requested locale (`Accept-Language`) with fallback.
- Long-form bodies (notes, articles, questions) carry a `language` tag and may have both versions.
- Rich text stored as **TipTap JSON** (safe, structured) + server-rendered sanitized HTML cache for web; mobile renders the JSON.
- All timestamps `timestamptz` UTC; BS conversion in `packages/domain/bs-date` (table-driven, unit-tested against
  reference dates); display timezone Asia/Kathmandu (+05:45).

## 11. Files

- Upload: client requests presigned PUT (type/size limits per purpose) → uploads to R2 → `POST /media/confirm` → server
  verifies object size + magic bytes, generates image variants (sharp) → `media_assets` row.
- Private bucket for PDFs/attachments (signed GET, ≤10 min); public bucket behind CDN for thumbnails/banners/avatars.
- PDF watermark (D-014): generated on download per user (pdf-lib), streamed, not stored; rate-limited.

## 12. Search

Generated `tsvector` columns (`simple` config, both languages) + `pg_trgm` GIN indexes on titles; unified `/search?q=` returns
grouped results respecting publish status (locked items appear as locked).

## 13. Observability & operations

- Sentry (api, worker, admin, web, mobile) with PII scrubbing; Pino JSON logs with secret redaction; request IDs.
- PostHog events from mobile/web (no PII payloads; user id hashed), feature flags stay in our own `settings`.
- Uptime checks on `/health/ready` and web.
- **Backups**: nightly `pg_dump` (compressed, encrypted) + WAL archiving if VPS disk allows; retention 7 daily / 4 weekly /
  6 monthly; restore drill documented. Offsite location pending (L4).
- Environments: `local` (Docker Compose), `staging` (same VPS or second small VPS, sandbox gateways), `production`.
- CI (GitHub Actions): install → lint → typecheck → unit → integration (Postgres + Redis services) → build; secret scanning;
  Prisma migration diff check. Deploy: build images → push to GHCR → SSH deploy with `docker compose pull && up -d` and
  `prisma migrate deploy`.

## 14. Security baseline

OWASP ASVS L2-oriented: authz on every route (default-deny guard), object-level checks (BOLA/IDOR) in services, mass-assignment
prevention via explicit DTOs, rate limits (login, OTP, payments, search), brute-force lockout, upload validation, SSRF-safe
outbound calls (fixed provider hosts), parameterized queries only, secrets via env, audit log for staff writes and all
financial state changes, no stack traces in responses, dependency audit in CI, signed deep links not trusted for state.

## 15. Mobile app architecture

- Expo Router (file-based): `(auth)`, `(onboarding)`, `(tabs)/home|courses|notices|profile`, `exam/[attemptId]` (modal stack,
  no tabs), `player/[id]`, `reader/[id]`, `checkout/*` (Android only).
- Data: TanStack Query (persisted cache for offline read of recently viewed lists), Zustand for UI/session state, MMKV.
- API client generated from OpenAPI (`packages/contracts`), auth interceptor with single-flight refresh.
- Design system components from `packages/design-tokens` (see `DESIGN_SYSTEM.md`); Reanimated for motion.
- Error/empty/loading/offline states are components, required on every screen.
- Deep links: `tayarikakshya://` + https universal/app links (domain pending) for payment returns, notifications, shares.
