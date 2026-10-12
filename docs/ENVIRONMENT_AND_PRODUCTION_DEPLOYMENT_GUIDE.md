# Environment & Production Deployment Guide

**Version 1 — 2026-10-12.** Written from the code on branch `docs/deployment-guide` (after Phase 15). This guide is
kept up to date in every later phase (see [§13 Keeping this guide current](#13-keeping-this-guide-current)).

**Who this is for:** the owner, step by step, assuming no prior knowledge of each service. It explains *what* to set,
*why*, *where the value comes from* and *how to check it worked*. It never contains real secret values.

> **Status labels used throughout**
> ✅ **Implemented** — the code uses it today; supplying the value is all that is needed.
> 🟡 **Implemented, needs your account / approval** — works once a provider approves you or you create something in
> their dashboard.
> 🔶 **Planned** — approved but not built yet; names and steps may change.
> 🏗️ **Deployment work (Phase 18)** — files and automation that do not exist yet (Docker images, server compose file,
> reverse proxy, backups, deploy pipeline). The steps describe the approved plan (ARCHITECTURE §13, D-037).

**Ground rules (never break these)**
1. Never paste a production secret into a chat, an issue, a commit, a screenshot or this repository.
2. `.env` files are git-ignored. Only `.env.example` files (placeholders) are committed.
3. Anything starting with `EXPO_PUBLIC_` or `VITE_` is copied into the app or the CMS page — **anyone can read it**.
   Never put a password, key, token secret or database address in one.
4. Each environment (development, staging, production) gets its **own** secrets. Never copy production secrets to a
   laptop or a staging server.
5. Before starting a server, run the configuration check ([§10](#10-configuration-validation)).

---

## Contents
1. [The big picture](#1-the-big-picture)
2. [Environment files — which app reads which file](#2-environment-files)
3. [Complete variable inventory](#3-complete-variable-inventory)
4. [Service setup guides](#4-service-setup-guides)
5. [Payments: eSewa, Khalti, ConnectIPS](#5-payments)
6. [Bunny Stream video](#6-bunny-stream-video)
7. [Development → staging → production: what changes](#7-development--staging--production)
8. [Production deployment runbook](#8-production-deployment-runbook)
9. [Smoke tests, rollback and recovery](#9-smoke-tests-rollback-and-recovery)
10. [Configuration validation](#10-configuration-validation)
11. [Production configuration audit — current status](#11-production-configuration-audit)
12. [Who does what](#12-who-does-what)
13. [Keeping this guide current](#13-keeping-this-guide-current)

---

## 1. The big picture

The product is five programs that share one database:

| Program | Folder | What it is | Where it will run in production |
|---|---|---|---|
| **API** | `apps/api` | NestJS server: all data, rules, payments, sign-in | Nepal VPS (D-037), Docker 🏗️ |
| **Worker** | `apps/api` (`dist/worker.js`) | Background jobs: emails, push, reminders, payment reconciliation, live classes | Same VPS, same settings as the API 🏗️ |
| **Admin CMS** | `apps/admin` | Staff website (React, static files) | Same VPS, behind the reverse proxy 🏗️ |
| **Website** | `apps/web` | Public Next.js site (catalogue, articles, web checkout, iPhone buyers) | Same VPS, Docker 🏗️ |
| **Student app** | `apps/mobile` | Expo / React Native app for Android and iPhone | Google Play / App Store, built with EAS |

They rely on these outside services:

| Service | Purpose | Status |
|---|---|---|
| PostgreSQL 17 | The database | ✅ |
| Redis 7 | Rate limits, caches, background job queues | ✅ |
| Cloudflare R2 (S3-compatible) | Pictures (public) and PDFs (private) | ✅ (SeaweedFS stands in locally) |
| SMTP email provider | Verification codes, receipts, notices | ✅ code; provider not chosen (L1) |
| Bunny Stream | Premium video with signed playback | ✅ (library already set up locally, KI-023 resolved) |
| YouTube (unlisted) | Free videos, live classes | ✅ (API key optional) |
| Google Cloud (OAuth) | "Sign in with Google" in the app | ✅ code; Android / iOS client ids still needed |
| eSewa, Khalti | Payments | 🟡 sandbox works; production needs your merchant keys |
| ConnectIPS | Payments | 🔶 not implemented (needs NCHL test credentials) |
| Expo push (+ Firebase FCM for Android, Apple APNs for iPhone) | Push notifications | ✅ code; 🟡 FCM / APNs credentials needed |
| Sentry | Error reports (API, worker, CMS, app) | ✅ (projects exist) |
| PostHog | App product analytics | ✅ (project exists) |
| SMS provider | Phone verification codes | 🔶 not chosen (L1); phone OTP is off |
| Expo / EAS | App builds, store submission, push | ✅ project `prashantdhimals-team/tayari-kakshya` |
| Apple Developer, Google Play Console | Publishing the app | 🟡 your accounts |
| Domain + DNS, VPS | Hosting | 🏗️ not chosen yet (L4) |

---

## 2. Environment files

An *environment variable* is a named setting (`DATABASE_URL=…`) that a program reads when it starts or is built.
Locally they come from `.env` files; on a server they come from the server's environment (a protected file or the
hosting panel), and for app builds from **EAS environment variables**.

| File (git-ignored unless `.example`) | Read by | When it is read | Template |
|---|---|---|---|
| **`/.env`** (repository root) | API, worker, Prisma (migrations), the website's **server**, content importer, tests | Every start of these programs | `/.env.example` |
| **`apps/mobile/.env`** | Expo when it builds / bundles the app | When `expo start` or a build begins | `apps/mobile/.env.example` |
| **`apps/admin/.env`** | Vite when it builds / serves the CMS | When `vite` starts or builds | `apps/admin/.env.example` |
| EAS environment variables (expo.dev) | App store builds (`eas build`) | During the cloud build; `eas.json` picks `development` / `preview` / `production` | — |
| Server environment (production) | API, worker, website server in Docker | Container start | `/.env.example` 🏗️ |

**Important consequences**
- The app and the CMS **do not read the root `.env`**. Their public values belong in their own folder's `.env`.
- The website's server reads the root `.env` locally (its `dev` / `start` scripts load it). In production it reads its
  container's environment. It needs only `API_BASE_URL`, `API_PUBLIC_URL`, `PUBLIC_WEB_URL` (+ `NODE_ENV`).
- **Server secrets go only in the root `.env` / server environment.** Never in `apps/mobile/.env`,
  `apps/admin/.env` or EAS *plain-text* variables.

**When do changes take effect?**

| What you changed | What to do |
|---|---|
| Root `.env` (API / worker) | Restart the API and worker (`pnpm --filter @tk/api dev` restarts itself on code changes, not on `.env` changes) |
| Root `.env` (website server values) | Restart the website server |
| `apps/admin/.env` | Development: restart `pnpm --filter @tk/admin dev`. Production: **rebuild** the CMS (values are baked into the files) |
| `apps/mobile/.env` | Development: restart Expo (`--clear` if it looks stale). Store app: **a new build** (and a store update) |
| EAS environment variable | A new `eas build` |
| A CMS **Settings** page value (prices, rules, payment methods on/off) | Nothing — takes effect at once; these are business settings, not environment variables |

---

## 3. Complete variable inventory

Columns: **Req.** = required (✔ always, **P** = required in staging/production, – = optional);
**Secret?** 🔐 must stay private / 🔓 safe to show; **Dev** = what development uses.
"If wrong" says what you will see. Every row was checked against `apps/api/src/config/env.ts` or the code that reads
it. Variables marked 🔶 are **not read by the code yet**.

### 3.1 Core API settings (root `.env`)

| Variable | Req. | Secret? | Dev | Staging / production | If missing or wrong |
|---|---|---|---|---|---|
| `NODE_ENV` | ✔ | 🔓 | `development` | `production` | config-check error on a live server |
| `APP_ENV` | ✔ | 🔓 | `development` | `staging` / `production` — turns on the strict rules below | Wrong value = wrong rules (e.g. log-only email allowed) |
| `PORT` | – | 🔓 | `4000` | `4000` inside the container | API listens elsewhere |
| `LOG_LEVEL` | – | 🔓 | `info` | `info` (or `warn`) | `debug` is noisy; config-check warns |
| `TRUST_PROXY` | P | 🔓 | `false` | The reverse proxy's and website server's addresses / CIDR ranges, e.g. `127.0.0.1,172.18.0.0/16`. `true` is **refused** | Rate limits count every visitor as the proxy (too strict) or can be fooled (with `true`) |
| `RATE_LIMIT_DEFAULT_PER_MINUTE` | – | 🔓 | `300` | `300` | — |
| `CORS_ALLOWED_ORIGINS` | – | 🔓 | `http://localhost:5173,http://localhost:8081` | Only https origins that call the API from a browser on **another** address. With the recommended set-up (CMS calls `/api` on its own address, website calls from its server) it can stay empty | Browser shows "blocked by CORS" |

### 3.2 PostgreSQL and Redis

| Variable | Req. | Secret? | Dev | Production | If wrong |
|---|---|---|---|---|---|
| `DATABASE_URL` | ✔ | 🔐 | `postgresql://tayari:…@localhost:5432/tayari_kakshya` (Docker) | `postgresql://<app user>:<strong password>@<host>:5432/<db>` — add `?sslmode=require` when the database is on another machine | API will not start; config-check `--connect` says "not reachable" or "migrations not applied" |
| `DATABASE_POOL_MAX` | – | 🔓 | empty (= 20) | 20 per process (API + worker = 40; keep the total below PostgreSQL's `max_connections`, default 100). More API processes → more connections | Bursts queue longer; too high exhausts the database |
| `TEST_DATABASE_URL` | dev / CI | 🔐 | `…/tayari_kakshya_test` | **Never set in production** | API tests refuse to run |
| `REDIS_URL` | ✔ | 🔐 | `redis://localhost:6379` | `redis://redis:6379` (private network) or `rediss://:<password>@host:6379` | Rate limits / jobs fail; API errors |

How to obtain: §4.1 and §4.2.

### 3.3 Authentication and sessions (generated by you, per environment)

| Variable | Req. | Secret? | How to create | If wrong |
|---|---|---|---|---|
| `JWT_ACCESS_SECRET` | ✔ | 🔐 | ≥ 32 random characters: `openssl rand -base64 48` (or `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`) | API refuses to start if shorter than 32; changing it ends current access tokens — apps quietly fetch new ones with their refresh token |
| `REFRESH_TOKEN_PEPPER` | ✔ | 🔐 | same, a **different** value | Changing it signs **everyone** out (all refresh tokens stop matching) |
| `OTP_PEPPER` | ✔ | 🔐 | same, different | Changing it invalidates codes already sent (minutes) |
| `ENCRYPTION_KEY` | ✔ | 🔐 | same, different | **Changing it breaks every staff member's two-factor** (they must enrol again). Back it up with the database backup keys |
| `JWT_ACCESS_TTL_SECONDS` | – | 🔓 | default `900` (15 min); allowed 60–3600 | — |
| `REFRESH_TOKEN_TTL_DAYS` | – | 🔓 | default `30` | — |

In staging / production the four secrets **must all be different** (the API refuses to start otherwise).

### 3.4 Google sign-in (app)

| Variable | File | Req. | Secret? | Value |
|---|---|---|---|---|
| `GOOGLE_OAUTH_WEB_CLIENT_ID` | root | – | 🔓 | OAuth client id of type *Web application* |
| `GOOGLE_OAUTH_ANDROID_CLIENT_ID` | root | – | 🔓 | OAuth client id of type *Android* |
| `GOOGLE_OAUTH_IOS_CLIENT_ID` | root | – | 🔓 | OAuth client id of type *iOS* |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` / `_ANDROID_` / `_IOS_` | `apps/mobile/.env` + EAS | – | 🔓 | The **same three ids** |

The API accepts a Google ID token only if it was issued for one of its three ids; the app shows the Google button only
for platforms whose id is set. No client *secret* is used anywhere (ID-token flow). The website has no Google sign-in.
Setup: §4.6.

### 3.5 Email

| Variable | Req. | Secret? | Dev | Production | If wrong |
|---|---|---|---|---|---|
| `EMAIL_PROVIDER` | ✔ | 🔓 | `smtp` (Mailpit) or `log` | `smtp` — `log` is **refused** in staging/production | No email leaves the server |
| `EMAIL_FROM` | P | 🔓 | `Tayari Kakshya <no-reply@localhost>` | `Tayari Kakshya <no-reply@mail.<your-domain>>` on a domain verified with the provider | config-check error; mail rejected as spam |
| `SMTP_HOST`, `SMTP_PORT` | with smtp | 🔓 | `localhost`, `1025` | provider's SMTP host, usually `587` | Start-up error "SMTP_HOST and SMTP_PORT are required" |
| `SMTP_SECURE` | – | 🔓 | `false` | `false` for port 587 (STARTTLS), `true` for 465 | Connection fails |
| `SMTP_USER`, `SMTP_PASSWORD` | P | 🔐 | empty | provider's SMTP login / API key | config-check `--connect`: login refused |

Setup: §4.4. Provider not chosen yet (OPEN_QUESTIONS L1).

### 3.6 SMS / phone codes

| Variable | Status | Notes |
|---|---|---|
| `SMS_PROVIDER` | ✅ | `disabled` (production today) or `log` (development only). Phone verification is off until a provider is chosen. |
| `SMS_API_KEY`, `SMS_SENDER_ID` | 🔶 | Planned names (L1, e.g. Sparrow SMS / Aakash SMS — sender ID approval needed). Not read yet. |

### 3.7 Payments — see [§5](#5-payments) for the full walkthrough

| Variable | Req. | Secret? | Dev / staging | Production |
|---|---|---|---|---|
| `PAYMENT_CALLBACK_BASE_URL` | with a gateway | 🔓 | `http://localhost:4000` | `https://api.<your-domain>` (no trailing slash; https enforced) |
| `PAYMENT_RETURN_URL_APP` | – | 🔓 | `tayarikakshya://payment-result` | same |
| `PAYMENT_RETURN_URL_WEB` | P with a gateway | 🔓 | `http://localhost:3000/payment-result` | `https://<your-domain>/payment-result` |
| `PAYMENT_ORDER_TTL_MINUTES` | – | 🔓 | empty = 60 | 60 (5–1440) |
| `ESEWA_ENV` | – | 🔓 | `sandbox` | `production` (sandbox refused in production) |
| `ESEWA_PRODUCT_CODE` | for eSewa | 🔓 | `EPAYTEST` (eSewa's public test merchant) | your merchant code from eSewa (`EPAYTEST` is refused) |
| `ESEWA_SECRET_KEY` | for eSewa | 🔐 | eSewa's published UAT key | your merchant secret key from eSewa |
| `ESEWA_FORM_URL`, `ESEWA_STATUS_URL` | – | 🔓 | empty (follows `ESEWA_ENV`) | empty |
| `KHALTI_ENV` | – | 🔓 | `sandbox` | `production` |
| `KHALTI_SECRET_KEY` | for Khalti | 🔐 | test key from test-admin.khalti.com | live secret key from admin.khalti.com |
| `KHALTI_BASE_URL` | – | 🔓 | empty (follows `KHALTI_ENV`) | empty |
| `CONNECTIPS_*` | 🔶 | 🔐 | — | Not implemented; see §5.3 |

A gateway is offered only when its keys are set **and** it is switched on in CMS → Settings → Payment methods.

### 3.8 File / media storage (Cloudflare R2 in production)

| Variable | Req. | Secret? | Dev (SeaweedFS) | Production (R2) | If wrong |
|---|---|---|---|---|---|
| `S3_ENDPOINT` | ✔ | 🔓 | `http://localhost:8333` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` | Uploads fail; config-check error for a local address |
| `S3_REGION` | – | 🔓 | `us-east-1` | `auto` | — |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | ✔ | 🔐 | dev-only keys | R2 API token (Object Read & Write, limited to the two buckets) | `--connect`: AccessDenied |
| `S3_BUCKET_PUBLIC` | ✔ | 🔓 | `tayari-dev-public` | e.g. `tayari-public` (pictures) | — |
| `S3_BUCKET_PRIVATE` | ✔ | 🔓 | `tayari-dev-private` | e.g. `tayari-private` (PDFs — **never public**) | Same name as public = error |
| `S3_FORCE_PATH_STYLE` | – | 🔓 | `true` | `true` or `false` (R2 accepts both) | — |
| `PUBLIC_MEDIA_BASE_URL` | ✔ | 🔓 | `http://localhost:4000/api/v1/public-media` | `https://media.<your-domain>` (R2 custom domain on the public bucket) — https enforced | Broken pictures |
| `PUBLIC_MEDIA_PROXY`, `STORAGE_AUTO_CREATE_BUCKETS` | dev only | 🔓 | `true` | `false` (refused when true) | Start-up error |
| `MEDIA_MAX_IMAGE_MB`, `MEDIA_MAX_PDF_MB` | – | 🔓 | `10`, `100` | same | Larger uploads refused |

### 3.9 Video

| Variable | Req. | Secret? | Notes |
|---|---|---|---|
| `BUNNY_STREAM_LIBRARY_ID` | for premium video | 🔓 | Bunny Stream library id |
| `BUNNY_STREAM_API_KEY` | with the library | 🔐 | Library → API → API key (reads video details) |
| `BUNNY_STREAM_TOKEN_KEY` | **P with the library** | 🔐 | Library → Security → Token authentication key. **Refused to start without it in staging/production** (premium videos would play unsigned) |
| `BUNNY_CDN_HOSTNAME` | – | 🔓 | Library's CDN hostname (`vz-….b-cdn.net`) for thumbnails |
| `VIDEO_PLAYBACK_TTL_SECONDS` | – | 🔓 | Signed link lifetime, default 300 |
| `YOUTUBE_API_KEY` | – | 🔐 | Optional: fills in YouTube titles and durations |

### 3.10 Push notifications

| Variable / item | Where | Req. | Secret? | Notes |
|---|---|---|---|---|
| `EXPO_PUSH_URL` | root | – | 🔓 | Default `https://exp.host/--/api/v2/push/send`; leave unset |
| `EXPO_ACCESS_TOKEN` | root | – | 🔐 | Only if you turn on Expo's "enhanced push security" |
| `GOOGLE_SERVICES_JSON` | EAS **file** variable / `apps/mobile/.env` | for Android push | 🔓* | Path to Firebase's `google-services.json` (new in this version). *Not a password, but keep it out of git (ignored) |
| FCM V1 service account key | uploaded to Expo (EAS credentials) | for Android push | 🔐 | Never in a file in this repository |
| APNs key | created by EAS during the first iOS build | for iPhone push | 🔐 | Managed by EAS |

### 3.11 Monitoring and analytics

| Variable | File | Secret? | Notes |
|---|---|---|---|
| `SENTRY_DSN_API` | root | 🔓 (semi-public) | API + worker errors; empty = off. Test with `pnpm --filter @tk/api cli monitoring-test` |
| `APP_RELEASE` | root | 🔓 | e.g. the git commit; groups errors by deployment |
| `VITE_SENTRY_DSN`, `VITE_APP_ENV`, `VITE_APP_RELEASE` | `apps/admin/.env` | 🔓 | CMS errors |
| `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_APP_ENV` | `apps/mobile/.env` + EAS | 🔓 | App crashes |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | **EAS secret** variables | 🔐 | Upload source maps during app release builds; never in a file |
| `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_HOST` | `apps/mobile/.env` + EAS | 🔓 | App analytics; empty = off |

Not implemented (optional later): error monitoring / analytics on the public website.

### 3.12 Public addresses, website and app build

| Variable | File | Req. | Secret? | Dev | Production |
|---|---|---|---|---|---|
| `PUBLIC_WEB_URL` | root (API **and** website) | P | 🔓 | `http://localhost:3000` | `https://<your-domain>` — coupon share links, Secure cookies, canonical links |
| `API_BASE_URL` | root (website server) | P | 🔓 | `http://localhost:4000` | How the website's server reaches the API, e.g. `http://api:4000` inside Docker |
| `API_PUBLIC_URL` | root (website server) | – | 🔓 | empty | `https://api.<your-domain>` (receipt links students open) |
| `EXPO_PUBLIC_API_URL` | `apps/mobile/.env` + EAS | **P for production builds** | 🔓 | empty (uses this computer) | `https://api.<your-domain>` — a production build **fails** without an https value |
| `APP_ANDROID_PACKAGE`, `APP_IOS_BUNDLE_ID` | mobile / EAS | – | 🔓 | empty = `com.tayarikakshya.app` | keep the default (D-065); changing it after publishing creates a new app |
| `EAS_PROJECT_ID` | mobile / EAS | – | 🔓 | empty (project id is in `app.config.ts`) | empty |
| `VITE_API_URL` | `apps/admin/.env` | – | 🔓 | empty | **empty** — the CMS calls `/api` on its own address (needed for the staff sign-in cookie) |

### 3.13 Tools, tests and CI (never in production)

| Variable | Used by | Notes |
|---|---|---|
| `CONTENT_API_URL`, `CONTENT_ADMIN_EMAIL`, `CONTENT_ADMIN_PASSWORD`, `CONTENT_ADMIN_MFA_CODE`, `CONTENT_UPDATE_QUESTIONS` | `tools/content-pack` importer (`pnpm --filter @tk/content-pack run import`) | Pass on the command line when importing; never store a production password in a file |
| `TEST_DATABASE_URL`, `TEST_LOG_LEVEL`, `E2E_*`, `VITE_API_PROXY` | tests | Development and CI only |
| GitHub Actions | CI | Uses only throw-away CI values (see `.github/workflows/ci.yml`); no production secrets in CI today 🏗️ |

### 3.14 Removed from the templates in this version (were never read by the code)
`ADMIN_BASE_URL`, `DATABASE_DIRECT_URL`, `VIDEO_PROVIDER`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `POSTHOG_API_KEY`,
`POSTHOG_HOST` (server), `SENTRY_DSN_ADMIN` (the CMS uses `VITE_SENTRY_DSN`), `GOOGLE_OAUTH_WEB_CLIENT_SECRET`. If your
local `.env` still has them, they are simply ignored. `SMS_API_KEY`, `SMS_SENDER_ID` and `CONNECTIPS_*` remain as
commented **planned** names.

---

## 4. Service setup guides

Each guide: create the account → create what the project needs → copy the values into the right place → test.
Where a provider's dashboard may change, follow the linked official documentation; this guide only states what the
project needs from it.

### 4.1 PostgreSQL ✅ (production 🏗️)
- **Development:** `pnpm infra:up` starts PostgreSQL 17 in Docker with the development database and the test database.
- **Production (planned, D-037):** PostgreSQL 17 in Docker on the Nepal VPS, reachable only on the private Docker
  network (no public port).
  1. Choose a strong password (password manager, 32+ characters).
  2. Create a database `tayari_kakshya` and an application user that owns it.
  3. Set `DATABASE_URL=postgresql://<user>:<password>@postgres:5432/tayari_kakshya` in the server environment
     (`postgres` = the database container's name). If you use a managed database on another host instead, add
     `?sslmode=require`.
  4. Apply the schema: `pnpm --filter @tk/api exec prisma migrate deploy` (never `migrate dev` on a server).
  5. Check: `pnpm --filter @tk/api cli config-check --connect` → "reachable, all N migrations applied".
- Backups: §8 step 16.

### 4.2 Redis ✅ (production 🏗️)
- Development: started by `pnpm infra:up`.
- Production: Redis 7 container on the private network, append-only file on, no public port:
  `REDIS_URL=redis://redis:6379`. If Redis is ever reachable from outside the server, require a password
  (`rediss://:<password>@host:6379`).
- Check: config-check `--connect` → "PING → PONG".

### 4.3 Cloudflare R2 (file storage) ✅
1. Create a Cloudflare account → **R2** → enable R2 (needs a payment method; free allowance applies).
2. Create two buckets, e.g. `tayari-public` and `tayari-private`.
3. **Public bucket only:** connect a **custom domain** (e.g. `media.<your-domain>`, the domain must be on Cloudflare
   DNS). Do **not** make the private bucket public — PDFs are served through the API with watermarks.
4. R2 → **Manage API tokens** → create a token with **Object Read & Write**, limited to these two buckets. Copy the
   Access Key ID and Secret Access Key (shown once) into the server environment as `S3_ACCESS_KEY_ID` /
   `S3_SECRET_ACCESS_KEY`.
5. `S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com` (account id is on the R2 overview page),
   `S3_REGION=auto`, `PUBLIC_MEDIA_BASE_URL=https://media.<your-domain>`, `PUBLIC_MEDIA_PROXY=false`,
   `STORAGE_AUTO_CREATE_BUCKETS=false`.
6. Check: config-check `--connect` → "both buckets reachable"; then upload a picture in CMS → Media and open it.
- Official docs: https://developers.cloudflare.com/r2/

### 4.4 Email (SMTP) ✅ code · provider not chosen (L1)
1. Choose a transactional email provider with SMTP (any; e.g. Amazon SES, Brevo, Mailgun, Postmark — your choice;
   record it in DECISIONS).
2. Use a sub-domain for sending, e.g. `mail.<your-domain>`, and add the **SPF, DKIM and DMARC** DNS records the
   provider shows. Wait until the provider marks the domain *verified*. Without this, Gmail will put codes in spam.
3. Create SMTP credentials in the provider's dashboard → `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_SECURE=false`,
   `SMTP_USER`, `SMTP_PASSWORD`; `EMAIL_PROVIDER=smtp`; `EMAIL_FROM="Tayari Kakshya <no-reply@mail.<your-domain>>"`.
4. Check: config-check `--connect` ("server accepted the connection and login"), then sign up a test account and
   confirm the code email arrives (also check the spam folder).
- Development: Mailpit catches all mail at http://localhost:8025.

### 4.5 SMS 🔶
Not implemented. When a Nepal SMS provider is chosen (L1) the integration will be built and this section completed
(sender ID / template approval usually takes days — start early).

### 4.6 Google sign-in ✅ code · 🟡 ids
All three ids come from **one** Google Cloud project (https://console.cloud.google.com).
1. **APIs & Services → OAuth consent screen:** app name *Tayari Kakshya*, support email, your domain, privacy policy
   URL (the website's privacy page), scopes `openid`, `email`, `profile`. Publish it (*In production*).
2. **Credentials → Create OAuth client ID:**
   - *Web application* (used by the app's Google flow and the browser build): authorised JavaScript origin
     `http://localhost:8081` for development. → `GOOGLE_OAUTH_WEB_CLIENT_ID` and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.
     (✔ already created.)
   - *Android*: package `com.tayarikakshya.app` + the **SHA-1 fingerprint of the signing key**. Get it with
     `eas credentials` (Android → production → keystore). After the first Play upload also add the **Play App
     Signing** SHA-1 (Play Console → Test and release → App integrity). → `GOOGLE_OAUTH_ANDROID_CLIENT_ID` and
     `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`.
   - *iOS*: bundle id `com.tayarikakshya.app`. → `GOOGLE_OAUTH_IOS_CLIENT_ID` and `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.
3. Put the `GOOGLE_OAUTH_*` ids in the server environment and the `EXPO_PUBLIC_GOOGLE_*` ids in EAS (all
   environments). Rebuild the app.
4. Check: config-check shows "3 of 3 client ids set"; sign in with Google on a real phone build.
- No client secret is needed (ID-token flow). Old secrets from earlier testing should be deleted in Google Cloud.

### 4.7 Bunny Stream ✅ — see [§6](#6-bunny-stream-video)

### 4.8 YouTube Data API (optional) ✅
Google Cloud (same project) → enable **YouTube Data API v3** → Credentials → API key → restrict it to that API (and
to your server's IP if possible) → `YOUTUBE_API_KEY`. Without it, staff type titles and durations themselves.

### 4.9 Push notifications ✅ code · 🟡 credentials
How it works: the app registers with Expo; the API sends through Expo's push service, which delivers through Google
FCM (Android) and Apple APNs (iPhone).
1. **Android (FCM)** — official guide: https://docs.expo.dev/push-notifications/fcm-credentials/
   1. Create a Firebase project (console.firebase.google.com) and add an Android app with package
      `com.tayarikakshya.app`. Download **`google-services.json`**.
   2. Upload it to EAS as a **file** environment variable named `GOOGLE_SERVICES_JSON` (expo.dev → project →
      Environment variables, environments *preview* and *production*). `app.config.ts` uses it automatically. Do not
      commit the file (it is git-ignored).
   3. Firebase → Project settings → Service accounts → generate a private key (JSON). Upload it with
      `eas credentials` → Android → production → Google Service Account → *Manage your Google Service Account Key for
      Push Notifications (FCM V1)* → upload. Then delete the downloaded JSON from your computer.
2. **iPhone (APNs):** needs a paid Apple Developer account. On the first iOS `eas build`, answer **yes** to "Setup
   Push Notifications" and "Generating a new Apple Push Notifications service key".
3. Optional: Expo **enhanced push security** → create an access token at expo.dev (account → access tokens) →
   `EXPO_ACCESS_TOKEN` on the server.
4. Check: install a build, allow notifications, publish a notice with "send as push" in the CMS → it arrives.

### 4.10 Sentry ✅ (projects exist)
Projects: API (Node.js), CMS (React), app (React Native). Each project's **DSN** goes to `SENTRY_DSN_API`,
`VITE_SENTRY_DSN`, `EXPO_PUBLIC_SENTRY_DSN`. Create an **organisation auth token** (source maps) and store it only as
the EAS secret `SENTRY_AUTH_TOKEN` (+ `SENTRY_ORG`, `SENTRY_PROJECT`). Revoke the token that was shared earlier (open
owner task). Check: `pnpm --filter @tk/api cli monitoring-test` → the test error appears in Sentry.

### 4.11 PostHog ✅ (project exists)
Project API key → `EXPO_PUBLIC_POSTHOG_KEY`; host `https://us.i.posthog.com` (or `eu`). The key is public by design.
The app never sends names, emails or phone numbers (tested).

### 4.12 Expo / EAS ✅
Project `prashantdhimals-team/tayari-kakshya` (id in `app.config.ts`). Install `eas-cli`, `eas login`. Build profiles
in `apps/mobile/eas.json` now name their EAS environment (`development`, `preview`, `production`); set each
environment's variables at expo.dev → project → **Environment variables** or with
`eas env:set --environment production --name EXPO_PUBLIC_API_URL --value https://api.<your-domain> --visibility plaintext`.
Use *plain text / sensitive* for `EXPO_PUBLIC_*` (they end up in the app anyway) and **secret** for
`SENTRY_AUTH_TOKEN`. Official docs: https://docs.expo.dev/eas/environment-variables/

### 4.13 Apple App Store and Google Play 🟡
- **Google Play Console** (one-time fee; an organisation account needs a D-U-N-S number). Create the app with package
  `com.tayarikakshya.app`; complete content rating, data safety (matches what the app collects), privacy policy URL.
- **Apple Developer Program** (yearly fee) + App Store Connect app with bundle id `com.tayarikakshya.app`. The iPhone
  app shows **no prices or purchase links** (D-027); purchases happen on the website — review notes should say so.
- Submission: `eas submit` (credentials stay in EAS).

### 4.14 Domain, DNS and HTTPS 🏗️
Buy the domain (L4). Recommended addresses (any names work — keep them consistent everywhere):

| Address | Points to |
|---|---|
| `https://<your-domain>` | Website |
| `https://api.<your-domain>` | API (gateways return here: `PAYMENT_CALLBACK_BASE_URL`) |
| `https://admin.<your-domain>` | CMS (its `/api/*` forwarded to the API) |
| `https://media.<your-domain>` | R2 public bucket (custom domain) |
| `mail.<your-domain>` | Email sending (SPF/DKIM/DMARC) |

The reverse proxy on the VPS (Caddy, planned) obtains HTTPS certificates automatically once DNS points at the server.

---

## 5. Payments

**What is verified in code:** paid access is granted only after the API itself asks the gateway (eSewa status API /
Khalti lookup) and the gateway confirms the **exact amount** of that order; duplicate callbacks are harmless; every
state change is audited; a sandbox gateway is refused in production (SECURITY_REVIEW). Switching a gateway from test
to production is **only configuration** — no code change.

### 5.1 eSewa (ePay v2) 🟡
- Official docs: https://developer.esewa.com.np/pages/Epay
- **Sandbox (works today):** `ESEWA_ENV=sandbox`, `ESEWA_PRODUCT_CODE=EPAYTEST` and eSewa's published UAT secret key
  (already in `.env.example`; note the docs page shows a stray "(" — the working key has none, proven against eSewa's
  own signed response). Test eSewa IDs `9711111111`–`9711111114`, password `Nepal@123`, MPIN `1122`, OTP `123456`
  (from eSewa's docs).
- **Production — needs eSewa, not code:**
  1. Register / use your eSewa **merchant** account (merchant.esewa.com.np) and ask eSewa for **ePay v2 production
     credentials** (product code + secret key) through their developer/merchant contact. eSewa may require business
     documents and a live website with refund/terms pages.
  2. Server environment: `ESEWA_ENV=production`, `ESEWA_PRODUCT_CODE=<yours>`, `ESEWA_SECRET_KEY=<yours>`, leave
     `ESEWA_FORM_URL` / `ESEWA_STATUS_URL` empty (production endpoints are built in:
     `https://epay.esewa.com.np/api/epay/main/v2/form`, status `https://esewa.com.np/api/epay/transaction/status/`).
  3. `PAYMENT_CALLBACK_BASE_URL=https://api.<your-domain>`. The API sends eSewa the return addresses with every
     payment (`/api/v1/payments/esewa/return`); nothing to register unless eSewa asks you to whitelist the domain.
  4. CMS → Settings → Payment methods: eSewa on.
  5. Test with a small real payment, then refund it.

### 5.2 Khalti (KPG-2 ePayment) 🟡
- Official docs: https://docs.khalti.com/khalti-epayment/
- **Sandbox:** sign up as a merchant at https://test-admin.khalti.com (login OTP `987654`), copy the **live secret key**
  shown in that *test* dashboard → `KHALTI_SECRET_KEY`, `KHALTI_ENV=sandbox` (base `https://dev.khalti.com/api/v2/`).
  Test Khalti IDs `9800000000`–`9800000005`, MPIN `1111`, OTP `987654`.
- **Production — needs Khalti, not code:**
  1. Merchant account at https://admin.khalti.com (business verification as Khalti requires).
  2. Copy the production **live secret key** → `KHALTI_SECRET_KEY`, `KHALTI_ENV=production`, `KHALTI_BASE_URL`
     empty (production base `https://khalti.com/api/v2/` built in).
  3. The API sends `return_url` (`/api/v1/payments/khalti/return`) and `website_url` with each payment.
  4. CMS → Settings → Payment methods: Khalti on. Test with a small real payment.

### 5.3 ConnectIPS (NCHL) 🔶 — **implementation gap**
Not implemented. Adding credentials will **not** make it work. Needed before it can be built (D-067 / D-073 — on hold):
NCHL merchant **test** credentials (merchant id, app id, app name, app password) and the **PFX certificate** +
passphrase used to sign requests; then production credentials after NCHL's approval. The draft variable names are
commented in `.env.example`. When built, this section will be completed and config-check extended.

### 5.4 iPhone
The iPhone app never sells (D-027). iPhone students buy on the website, so the website's payment return
(`PAYMENT_RETURN_URL_WEB`) must be correct.

---

## 6. Bunny Stream video

- **Product:** Bunny **Stream** (a video library), using the **embed player** with **embed view token
  authentication** (T-031). Native Bunny SDKs and DRM are not used.
- **How access works:** the student asks the API for playback → the API checks their access to that lesson → it
  returns a player link signed with `SHA256_HEX(token key + video id + expiry)` that expires after
  `VIDEO_PLAYBACK_TTL_SECONDS` (default 5 min). The app opens that link in a web view; Bunny's player then signs its
  own stream requests. The key never leaves the server.
- **Why domains alone are not enough:** the app's web view sends **no Referer**, so "allowed domains" cannot protect
  app playback — the **signed token** is the protection. Allowed domains and CDN token authentication are extra layers
  (KI-023: verified working with no Referer).

| Value | Where | Secret? |
|---|---|---|
| Library ID | `BUNNY_STREAM_LIBRARY_ID` (server) | 🔓 |
| Library API key | `BUNNY_STREAM_API_KEY` (server) | 🔐 |
| Token authentication key | `BUNNY_STREAM_TOKEN_KEY` (server) | 🔐 — never in the app or CMS |
| CDN hostname | `BUNNY_CDN_HOSTNAME` (server) | 🔓 |

**Setup / checks** (library already exists — values in your local `.env`):
1. bunny.net → Stream → your library → **Security**: *embed view token authentication* ON; CDN token authentication ON;
   allowed domains = your website and CMS domains (and `localhost` for development) — already done (KI-023).
2. Copy the same four values into the **production** server environment. Use the same library for staging only if you
   accept that staging can play production videos; otherwise create a second library.
3. Check: config-check `--connect` → "library API key accepted"; as a student **with** access a premium video plays; as
   a student **without** access the API refuses (403); a copied player link stops working after 5 minutes.
- Official docs: https://docs.bunny.net/docs/stream-embed-token-authentication

---

## 7. Development → staging → production

| Area | Development | Staging (planned) | Production |
|---|---|---|---|
| `APP_ENV` / `NODE_ENV` | development / development | staging / production | production / production |
| Database | Docker on your PC | separate database on the VPS (or a second VPS) | its own database, private network, backups |
| API address | `http://localhost:4000` | `https://api.staging.<domain>` | `https://api.<domain>` |
| App → API | empty (uses this computer) | EAS *preview*: `EXPO_PUBLIC_API_URL=https://api.staging.<domain>` | EAS *production*: `https://api.<domain>` (build fails otherwise) |
| Google sign-in | web client + localhost origin | same project, ids in EAS *preview* | Android SHA-1 of the release + Play signing keys |
| CORS | localhost origins | only https origins, or empty | only https origins, or empty |
| Payments | sandbox keys | sandbox keys (`ESEWA_ENV=sandbox` allowed on staging) | production keys; sandbox **refused** |
| Payment callbacks | `http://localhost:4000` | `https://api.staging.<domain>` | `https://api.<domain>` |
| Video | Bunny library (local `.env`) | same or separate library | production library, token key **required** |
| Storage | SeaweedFS, media through the API | R2 staging buckets | R2 production buckets + `media.` domain |
| Email | Mailpit | real SMTP (test inboxes) | real SMTP, verified domain |
| Push | Expo Go / dev build | preview builds | store builds with FCM + APNs |
| HTTPS | none | required | required |
| Logging / monitoring | pretty logs; Sentry optional | JSON logs, Sentry environment *staging* | JSON logs, Sentry *production*, uptime check |
| Debug | dev tools on | off | off |
| Migrations | `prisma migrate dev` | `prisma migrate deploy` | `prisma migrate deploy` (after a backup) |
| Backups | none | optional | nightly + off-site (L4) |
| Secrets | `.env` on your PC | server environment | server environment, separate values, password manager copy |
| App builds | Expo Go / `development` profile | `preview` profile | `production` profile → stores |

**Order for switching an environment (never just change `NODE_ENV`):**
1. Create the infrastructure (server, database, Redis, buckets, DNS, HTTPS).
2. Generate this environment's own secrets (§3.3).
3. Fill in the server environment from `/.env.example` (strict values per §3).
4. Run `config-check` **without** `--connect` until it reports 0 errors, then **with** `--connect`.
5. Back up (production) and run `prisma migrate deploy`.
6. Start API + worker + website; build and serve the CMS.
7. Create the first Super Admin (`pnpm --filter @tk/api cli create-super-admin --email … --name "…"`), set its
   password from the emailed code, enrol two-factor.
8. Point the app builds at this environment (EAS environment variables) and build.
9. Run the smoke tests (§9).

---

## 8. Production deployment runbook

🏗️ = the files/automation for this step are built in **Phase 18**; until then the step describes the plan.

| # | Step | Who | Status |
|---|---|---|---|
| 1 | Accounts: VPS (Nepal, L4), domain, Cloudflare (R2 + DNS), email provider, Bunny ✔, Google Cloud ✔, Firebase, Expo ✔, Sentry ✔, PostHog ✔, eSewa + Khalti merchant, Apple Developer, Google Play | **You** | partly done |
| 2 | Hosting: one VPS with Docker Compose — reverse proxy (Caddy, automatic HTTPS), API, worker, website, CMS static files, PostgreSQL, Redis (D-037) | Me (compose files) + you (server) | 🏗️ |
| 3 | Domain & DNS: records of §4.14 → VPS IP; R2 custom domain; email SPF/DKIM/DMARC | **You** (I give exact records) | 🏗️ |
| 4 | Database: PostgreSQL container, private network, strong password | Me (compose) + you (password) | 🏗️ |
| 5 | Secrets: server environment file readable only by root (or the host's secret store); password-manager copy; never in git | **You** | 🏗️ |
| 6 | Migrations: backup → `prisma migrate deploy` (part of the deploy script) | Automated | 🏗️ |
| 7 | API + worker: Docker image, `node dist/main.js` and `node dist/worker.js` with the same environment | Automated | 🏗️ |
| 8 | CMS: `pnpm --filter @tk/admin build` with `apps/admin/.env` (production DSN), files served by the proxy; `/api/*` on the CMS address forwarded to the API; security headers (CSP, HSTS, frame-ancestors — SECURITY_REVIEW R-2) | Automated | 🏗️ |
| 9 | Android: EAS *production* environment variables (§3.12, §4.9), `eas build -p android --profile production`, upload to Play (internal testing first) | You run the commands (I prepare) | ready once values exist |
| 10 | iOS: same with `-p ios`; APNs key on first build; TestFlight → review | You | ready once values exist |
| 11 | Payments: production keys (§5), small real payments, refund | **You** + me | 🟡 |
| 12 | Video/storage: Bunny values, R2 buckets + domain | You | ✅ code |
| 13 | Notifications & email: SMTP verified domain; FCM + APNs | You | 🟡 |
| 14 | HTTPS & callbacks: all addresses https; `PAYMENT_CALLBACK_BASE_URL`, `PAYMENT_RETURN_URL_WEB`, `PUBLIC_WEB_URL` | config | ✅ checked by config-check |
| 15 | Monitoring: Sentry DSNs + `APP_RELEASE`; uptime check on `https://api.<domain>/api/v1/health/ready` and the website | You (uptime service) + config | 🏗️ uptime |
| 16 | Backups: nightly encrypted `pg_dump`, 7 daily / 4 weekly / 6 monthly, copy off-site (L4); R2 bucket versioning or periodic copy; **restore drill** | Me (scripts) + you (off-site place) | 🏗️ |
| 17 | Smoke tests (§9) | Me + you | — |
| 18 | Rollback plan (§9) | Me | 🏗️ |
| 19 | Release readiness: config-check 0 errors, CI green, owner launch checklist (business settings in the CMS, legal pages approved, prices) | Both | Phase 17 audit |

The **TRUST_PROXY** value for this layout: the proxy and the website reach the API over the Docker network — set it to
that network's range (e.g. `172.18.0.0/16`, exact value when the compose file exists).

---

## 9. Smoke tests, rollback and recovery

**Smoke tests after every deployment** (about 15 minutes):
1. `https://api.<domain>/api/v1/health/ready` → 200.
2. Website home, a course page and an article load over https; no browser console errors.
3. CMS: sign in with two-factor; open Courses; upload a small picture and see it.
4. App (production build): sign up → email code arrives → Home loads; open a free lesson and its PDF.
5. Premium video plays for an entitled test student and is refused for another.
6. A real small payment with each enabled gateway, then a refund (production) / a sandbox payment (staging).
7. Publish a notice with push → arrives on a phone.
8. Sentry shows the release; no new errors.

**Load test before launch** (Phase 16 tool): run `apps/api/scripts/load/weekly-exam.mjs` against **staging** (never
production) to check a weekly-exam rush — N students start, save, submit and open results at once. Locally (one API
process, Windows): 200 at once → 0 errors, start ≈ 3 s / submit ≈ 2.5 s at the 50th percentile (≈ 50 ms each when
alone). Size the number of API processes from the staging result.

**Rollback (planned 🏗️):** every release is a tagged image; rollback = start the previous image tag. Database
migrations only move forward — a release that changes the database is deployed only after a backup, and its
migration is written to be compatible with the previous release where possible. If data is damaged: stop the API and
worker, restore the last backup into a new database, point `DATABASE_URL` at it, start again, and note what was lost.

---

## 10. Configuration validation

Three layers, none of which prints a value:

1. **Start-up validation (API + worker)** — the API refuses to start when a required variable is missing or malformed,
   listing the variable names and reasons (`apps/api/src/config/env.ts`). In staging/production it also refuses:
   log-only email or SMS, the development media proxy / bucket creation, a sandbox payment gateway (production),
   `TRUST_PROXY=true`, a gateway without an https callback base, **Bunny without the token key, re-used secrets, and an
   http media address** (the last three new in this version).
2. **`config-check` command (new)** — run it before starting a server:
   ```
   pnpm --filter @tk/api build          # once, so the command exists
   pnpm --filter @tk/api cli config-check                  # settings only (works offline)
   pnpm --filter @tk/api cli config-check --connect        # + database, migrations, Redis, buckets, SMTP, Bunny
   pnpm --filter @tk/api cli config-check --env-file /path/to/production.env   # check a file without using it
   ```
   It runs the start-up validation, then a review that is **strict when `APP_ENV` is staging or production** (errors
   for development credentials, placeholder sender address, local storage, http website / payment return
   addresses, eSewa's test merchant in production, …) and informational on a development machine. Exit code 1 when
   something must be fixed — usable in a deploy script.
3. **Website start-up check (new)** — the production website server refuses to start without `API_BASE_URL` and an
   https `PUBLIC_WEB_URL` (`apps/web/src/instrumentation.ts`).
4. **App build check (new)** — an EAS *production* build stops unless `EXPO_PUBLIC_API_URL` is an https address
   (`apps/mobile/app.config.ts`).

| Check | Runs locally | Needs the service |
|---|---|---|
| Start-up validation, `config-check` | ✔ | — |
| `config-check --connect` | ✔ (against your local or a reachable server) | database, Redis, storage, SMTP, Bunny API |
| Gateways (eSewa / Khalti) | — | a sandbox / small real payment (no safe automatic check) |
| Google sign-in, push | — | a real app build on a phone |
| Sentry | `cli monitoring-test` | Sentry |

---

## 11. Production configuration audit

Current status (2026-10-12). This is **not** a production-ready statement — Phases 16–18 remain.

**A. Ready to configure (code done, just values):** core settings, PostgreSQL, Redis, secrets, SMTP email, R2
storage, Bunny, YouTube key, Google ids, Sentry, PostHog, Expo push token, public addresses, eSewa and Khalti
sandbox / production switch, app build variables.

**B. Requires your credentials:** production database password (you create), server secrets (you generate), SMTP
login, R2 API token, eSewa production product code + secret key, Khalti production live secret key, Google Android /
iOS client ids, Firebase `google-services.json` + FCM service account key, Apple Developer account, Sentry auth token
(new, after revoking the old one).

**C. Requires your action in an external dashboard:** eSewa and Khalti merchant activation; email domain verification
(SPF/DKIM/DMARC); Google OAuth consent screen + Android SHA-1; Firebase project; EAS environment variables; Bunny
allowed domains for the production domains; Cloudflare R2 buckets + custom domain; Play Console and App Store Connect
listings; DNS records.

**D. Requires implementation work:** ConnectIPS (on hold, D-073); SMS provider (L1); website error monitoring
(optional); Phase 18 deployment files (Dockerfiles, production compose, Caddy, deploy workflow, backup scripts,
restore drill); CMS security headers (in the proxy).

**E. Requires deployment:** VPS (L4), domain, HTTPS, staging environment, uptime monitoring, off-site backups.

**F. Requires production verification:** a real payment + refund per gateway; email deliverability to Gmail; push on
Android and iPhone; Google sign-in on release builds; premium video protection on the production domain; restore
from a backup; load test of the weekly-exam rush (Phase 16).

---

## 12. Who does what

| You (the owner) | Me (development) |
|---|---|
| Create accounts, merchant applications, domain, VPS | Keep `.env.example` files and this guide in step with the code |
| Generate and store production secrets; enter them on the server / EAS | Build validation so missing values are caught before launch |
| DNS records and dashboard settings (§11 C) | Phase 18 deployment files, backup scripts, deploy pipeline |
| Run `eas build` / `eas submit` with your Apple / Google accounts | Tell you exactly which values and records are needed |
| Approve legal pages, prices and business settings in the CMS | Smoke tests and fixes |

**Never** send me production secrets. I will ask only for *names*, *non-secret identifiers* (e.g. a library id or a
client id) or the *output of `config-check`* (which contains no values).

---

## 13. Keeping this guide current

Every phase that adds, removes or renames a variable, a service, a callback address or a deployment step updates, in
the same pull request: this guide (only the affected sections + the change log below), the matching `.env.example`,
`ENVIRONMENT_REQUIREMENTS.md`, `ENVIRONMENT_STATUS.md`, and `config-check` / the start-up validation when a rule
applies. The final audit (§11) is repeated in Phase 17 against the code.

### Change log
| Date | Change |
|---|---|
| 2026-10-13 | Phase 16: `DATABASE_POOL_MAX` (database connections per process, default 20); importer option `CONTENT_UPDATE_QUESTIONS` and the correct command `pnpm --filter @tk/content-pack run import`; load test `apps/api/scripts/load/` (§9). |
| 2026-10-12 | Version 1 (after Phase 15). Added `config-check`, website start-up check, app production-build check, `GOOGLE_SERVICES_JSON`, EAS environments per build profile, production rules for the Bunny token key / distinct secrets / https media. Split public app and CMS templates into `apps/mobile/.env.example` and `apps/admin/.env.example`; removed never-read names from the root template. |
