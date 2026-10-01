# Technology Stack Options

Status: **PROPOSED — NOT APPROVED** (awaiting owner decision, Q42). Nothing here is locked until recorded in `DECISIONS.md`.
Fixed by owner: **React Native** (mobile) and **PostgreSQL** (canonical database).

Cost notes are relative (Low / Medium / High) — exact vendor prices change and will be checked against current
pricing pages before any account is created.

## Product constraints that drive the choices

1. Users are mostly on Android, often on mid-range phones and patchy mobile data → small bundles, caching, resumable video, HLS adaptive bitrate.
2. Weekly exams create **sharp concurrency spikes** (many students start at the same minute) → stateless API, server-authoritative timers, cheap autosave writes, Redis.
3. Payments via eSewa / Khalti / ConnectIPS are **redirect/web-form based** with server-side verification — no native SDK is required, so they work with any RN setup.
4. Heavy relational data (taxonomy, entitlements, attempts, transactions) → strong SQL, migrations, constraints.
5. A large Admin CMS (30+ modules) → CRUD ergonomics, shared validation schemas, typed API client.
6. Small team, long-lived product → one language (TypeScript) across mobile, CMS and backend; monorepo with shared packages.

---

## 1. Mobile setup

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Expo (SDK latest) with dev builds + CNG, EAS Build/Update** | Fastest setup; config plugins cover native modules (secure store, video, notifications, file system); OTA updates for JS fixes; Expo Router file-based navigation; still allows any native code via prebuild | EAS cloud builds cost money beyond the free tier (local builds are free); must keep SDK upgraded | ✅ **Recommended** |
| React Native CLI (bare) | Full native control | More native maintenance, manual upgrades, no first-class OTA | Acceptable, slower |

**Recommendation:** Expo + Expo Router + TypeScript. Video via `expo-video`; secure tokens via `expo-secure-store`; payments via in-app browser (`expo-web-browser`) to the gateway, return via deep link, then server verification.

## 2. Backend framework

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **NestJS (Fastify adapter)** | Modular architecture for ~25 domains; guards/interceptors map directly to RBAC, audit and validation; first-class OpenAPI, BullMQ, scheduling; widely known | More boilerplate; decorators | ✅ **Recommended** |
| Fastify (plain) | Very fast, lean | Must build structure/conventions ourselves; drifts on large teams | Good for small APIs |
| Express | Ubiquitous | Dated ergonomics, slower, no structure | Not recommended |
| Next.js API routes | One deployable with admin | Serverless-oriented; poor fit for long-running jobs, websockets, payment workers | Not recommended for core API |

## 3. API style

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **REST (versioned `/api/v1`) + OpenAPI → generated TS client** | Simple caching/CDN, easy for payment callbacks/webhooks, easy to debug, typed clients for mobile + admin | Some over/under-fetching (solved with aggregate endpoints like `/home`) | ✅ **Recommended** |
| GraphQL | Flexible queries | Authz per field is harder; caching/complexity; overkill | No |
| tRPC | Excellent TS DX | Couples clients to server TS; weaker for mobile versioning & 3rd-party callbacks | No |

## 4. ORM / query layer

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Prisma** | Mature migrations, excellent DX, typed client, TypedSQL/raw SQL escape hatch for analytics | Less control over complex SQL; schema DSL separate from TS | ✅ **Recommended** |
| Drizzle | SQL-close, lightweight, great for complex queries | Younger migration tooling; more manual relations | Strong alternative |
| TypeORM | Familiar to many | Historically buggy migrations/typing | No |
| Raw SQL / Kysely | Total control | Slower to build 30+ CRUD modules | Used selectively for reports |

## 5. Authentication

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **In-house in NestJS: Argon2id passwords, short-lived JWT access (~15 min) + rotating opaque refresh tokens (hashed in DB, per device session, reuse detection), Google ID-token verification, OTP via email/SMS** | Full control of device limits, RBAC, account linking, Nepal SMS providers; no per-MAU fees; data stays in our Postgres | We own the security surface → requires careful implementation + tests | ✅ **Recommended** |
| Better Auth (library, self-hosted) | Batteries included, still self-hosted | Another abstraction to fit with NestJS/RBAC | Alternative |
| Firebase Auth / Supabase Auth / Clerk | Fast start, managed | Vendor lock-in, per-MAU cost (Clerk), user data split from Postgres, less control over session/device rules | No |

Admin CMS uses the same API with separate admin accounts, mandatory strong passwords, optional TOTP 2FA (recommended for Super Admin/Finance).

## 6. State management

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **TanStack Query (server state) + Zustand (small client state)** | Caching, retries, offline-aware refetch, minimal boilerplate | Two libraries | ✅ **Recommended** (mobile + admin) |
| Redux Toolkit + RTK Query | One ecosystem, devtools | More boilerplate | Alternative |
| Context only | No deps | Re-render issues, no caching | No |

Exam-in-progress state is persisted locally (MMKV) and synced to the server via autosave.

## 7. File storage

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Cloudflare R2** (S3-compatible) | No egress fees (PDF-heavy LMS), presigned URLs, global CDN | Fewer features than S3 | ✅ **Recommended** |
| AWS S3 + CloudFront | Industry standard | Egress costs | Alternative |
| Local disk on VPS | Cheap | No redundancy, doesn't scale | No |

All uploads go through presigned URLs with type/size validation, then server-side verification (magic bytes), image re-encoding.

## 8. Video delivery

| Option | Pros | Cons | Cost | Fit |
|---|---|---|---|---|
| **Bunny Stream** | Transcoding + HLS + CDN with strong Asia presence, signed-URL token auth, optional DRM, very low per-GB pricing | Smaller vendor | Low | ✅ **Recommended** |
| Cloudflare Stream | Simple, signed URLs, pairs with R2 | Priced per minute stored + delivered; less control | Low–Medium | Strong alternative |
| Mux | Best analytics/DX | Highest cost | High | No (cost) |
| Self-hosted (ffmpeg → HLS on R2) | Cheapest at scale | We operate the transcoding pipeline; no DRM | Low infra / High effort | Later option |
| YouTube unlisted | Free | No access control (links leak), ads/branding, ToS limits | Free | Not for premium |

Abstracted behind a `VideoProvider` interface so the provider can change. Final choice depends on Q11 (hours, offline, DRM).

## 9. Cache

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Redis** (managed, or self-hosted on the VPS) | Rate limiting, sessions/denylist, exam timers, BullMQ, hot caches | One more service | ✅ **Recommended** |
| PostgreSQL only | Fewer moving parts | Weak for rate limits/queues at exam spikes | Possible for MVP only |

## 10. Search

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **PostgreSQL full-text + `pg_trgm`** | No extra infra; good for courses/questions/news at our scale | No Nepali stemmer (use `simple` config + trigram for Devanagari); limited relevance tuning | ✅ **Recommended for launch** |
| Meilisearch | Typo-tolerant, fast, easy | Extra service to sync | Upgrade path |
| OpenSearch/Elasticsearch | Very powerful | Heavy ops/cost | No |

## 11. Background jobs / queues

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **BullMQ (Redis)** | Retries, delays, cron, rate-limited workers; NestJS integration | Requires Redis | ✅ **Recommended** (with Redis) |
| pg-boss (Postgres) | No Redis needed | Lower throughput | Fallback if Redis rejected |
| Cloud queues (SQS etc.) | Managed | Vendor lock-in, more glue | No |

Jobs: payment reconciliation, exam auto-submit/scoring, scheduled publishing, push fan-out, emails/SMS, video-status sync, imports, subscription expiry.

## 12. Push notifications

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **expo-notifications + Expo Push Service** (backed by FCM/APNs) | One API for Android + iOS, receipts, free | Dependency on Expo's service | ✅ **Recommended** |
| FCM direct via firebase-admin (FCM also delivers to iOS via APNs key) | No intermediary | More setup, manage tokens per platform | Alternative (switchable behind interface) |

## 13. Admin CMS

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **React + Vite SPA, TanStack Router + Query + Table, React Hook Form + Zod, shadcn/ui (Radix) + Tailwind, TipTap rich-text editor** | Admin needs no SSR/SEO; fast; full design control; shares Zod schemas & API client with backend | We build CRUD scaffolding (mitigated with a generic resource-table/form framework) | ✅ **Recommended** |
| Next.js (App Router) | SSR, could also host public marketing/blog site | More complexity for a logged-in tool | Alternative; good for a future public website |
| Refine / React-Admin | CRUD scaffolding fast | Framework constraints; generic look | Alternative |
| Headless CMS (Payload/Strapi/Directus) | Instant CRUD | Splits business logic, permissions and exam/payment rules across two backends | No |

## 14. Monitoring & analytics

| Area | Recommendation | Alternatives |
|---|---|---|
| Errors/performance | **Sentry** (mobile, admin, backend) | Self-hosted GlitchTip |
| Logs | **Pino** structured JSON logs → hosting provider log drain / Grafana Loki | Better Stack |
| Uptime | **Better Stack / UptimeRobot** | — |
| Product analytics | **PostHog** (cloud or self-host) — pending Q38 | Firebase Analytics |

## 15. Repository & tooling

- **Monorepo** with **pnpm workspaces + Turborepo**:
  `apps/mobile` (Expo), `apps/admin` (Vite), `apps/api` (NestJS), `packages/contracts` (Zod schemas + generated API client), `packages/config` (eslint/tsconfig), `packages/design-tokens`.
- Testing: **Vitest/Jest** (unit), **Supertest + Testcontainers/real Postgres** (API integration), **Playwright** (admin E2E), **Maestro** (mobile E2E), **React Native Testing Library**.
- CI: **GitHub Actions** (lint, typecheck, tests, migration check, secret scanning).
- Local infra: **Docker Compose** (Postgres 17, Redis) — requires Docker Desktop (Q41).

## 16. Hosting (decision deferred to Q36)

| Option | Pros | Cons |
|---|---|---|
| Managed containers (Railway/Render/Fly) + managed Postgres | Least ops | Higher cost per resource; region choice limited |
| VPS (Hetzner / DigitalOcean Bangalore) + Docker + managed Postgres | Low cost, predictable | We operate servers (patching, backups) |
| AWS (ap-south-1 Mumbai): ECS/Fargate + RDS + ElastiCache | Scales, close to Nepal | Highest complexity/cost |

---

## Recommended stack (summary for approval)

| Area | Recommendation |
|---|---|
| Mobile | Expo (React Native, TypeScript), Expo Router, dev builds, EAS |
| Backend | NestJS on Fastify, TypeScript |
| API | REST `/api/v1` + OpenAPI + generated client |
| Database | PostgreSQL 17 (fixed) |
| ORM | Prisma (+ raw SQL for reports) |
| Auth | In-house JWT + rotating refresh tokens, Argon2id, Google, OTP |
| State | TanStack Query + Zustand (+ MMKV for persistence) |
| Storage | Cloudflare R2 |
| Video | Bunny Stream (alt: Cloudflare Stream) behind `VideoProvider` |
| Cache | Redis |
| Search | Postgres FTS + pg_trgm |
| Jobs | BullMQ |
| Push | expo-notifications + Expo Push (FCM/APNs) |
| Admin CMS | React + Vite + TanStack + shadcn/ui + Tailwind |
| Monitoring | Sentry + Pino + uptime checks (+ PostHog if approved) |
| Repo | pnpm + Turborepo monorepo, GitHub Actions |
