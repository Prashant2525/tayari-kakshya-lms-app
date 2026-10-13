# Environment Requirements

> **The complete, code-verified inventory with step-by-step setup is now
> [`ENVIRONMENT_AND_PRODUCTION_DEPLOYMENT_GUIDE.md`](ENVIRONMENT_AND_PRODUCTION_DEPLOYMENT_GUIDE.md).** This page keeps the
> who-provides-what overview; names corrected to match the code on 2026-10-12.

Status (2026-10-04): **received** — Bunny Stream (Phase 6), Sentry DSNs for the API, app and admin + auth token, PostHog project key + host, Google OAuth **web** client (id + secret, secret unused; `http://localhost:8081` registered — checked). All in local `.env` files only (root, `apps/mobile/.env`, `apps/admin/.env`). **Still needed:** Google Android/iOS client ids (need the app identifiers, L5), Cloudflare R2, payment sandboxes, push credentials.
None are needed until the matching phase begins. Launch gateways: eSewa + Khalti (D-003); ConnectIPS later (Phase 14). Analytics: PostHog (D-039).
Rules: never commit real values; `.env*` files are git-ignored except `.env.example`; production secrets live in the
hosting provider's secret manager / GitHub Actions secrets; sandbox/test credentials are used until production
credentials are explicitly provided by the owner.

Legend: 🔐 secret · 🔓 non-secret config · Phase = when it is first needed.

## 1. Core platform

| Variable | Kind | Phase | Who provides | Notes |
|---|---|---|---|---|
| `NODE_ENV`, `APP_ENV` | 🔓 | 4 | me | `development` / `staging` / `production` |
| `API_BASE_URL`, `API_PUBLIC_URL`, `PUBLIC_WEB_URL` | 🔓 | 4 | owner (domains, Q36) | |
| `CORS_ALLOWED_ORIGINS` | 🔓 | 4 | me | admin + web origins only |
| `DATABASE_URL` | 🔐 | 4 | owner/hosting (local: me) | PostgreSQL 17; production stack: `postgres:5432` on the private network (no TLS needed); a managed database elsewhere: `sslmode=require` |
| Production stack (`infra/production/.env`): `TK_APP_ENV_FILE`, `WEB_DOMAIN`, `API_DOMAIN`, `ADMIN_DOMAIN`, `ACME_EMAIL`, `POSTGRES_*`, `REDIS_PASSWORD`, `API_REPLICAS`, `VITE_SENTRY_DSN`, `VITE_APP_ENV`, `TK_RELEASE`, `BACKUP_PASSPHRASE`, `BACKUP_DIR`, `BACKUP_RCLONE_REMOTE` | 🔐 (passwords, passphrase) | 18 | owner (server) | Template `infra/production/compose.env.example`; guide §3.15 |
| `DATABASE_POOL_MAX` | 🔓 | 16 | me | connections per process (default 20) |
| `REDIS_URL` | 🔐 | 4 | hosting (local: me) | rate limits, cache, BullMQ |
| `JWT_ACCESS_SECRET` | 🔐 | 4 | generated per env | never reused across envs |
| `REFRESH_TOKEN_PEPPER`, `OTP_PEPPER` | 🔐 | 4 | generated | refresh tokens stored hashed |
| `ENCRYPTION_KEY` | 🔐 | 4 | generated | field-level encryption (e.g. 2FA secrets) |

## 2. Identity & messaging

| Variable | Kind | Phase | Who provides | Notes |
|---|---|---|---|---|
| `GOOGLE_OAUTH_WEB_CLIENT_ID`, `GOOGLE_OAUTH_ANDROID_CLIENT_ID`, `GOOGLE_OAUTH_IOS_CLIENT_ID` | 🔓 | 8 | owner's Google Cloud project | Android requires SHA-1 of signing key |
| `EMAIL_PROVIDER`, `EMAIL_FROM`, `SMTP_HOST/PORT/SECURE/USER/PASSWORD` | 🔐 | 4 | owner | verified sending domain (SPF/DKIM/DMARC) |
| `SMS_PROVIDER` (✅ `disabled`/`log`); `SMS_API_KEY`, `SMS_SENDER_ID` (🔶 planned, not read yet) | 🔐 | when phone verification is enabled (D-029, L1) | owner | Nepal providers e.g. Sparrow SMS, Aakash SMS — sender ID/template approval required |

## 3. Payments (Phase 11 — re-verify official docs before coding)

Verified against official docs on 2026-10-02 (summary; full re-check required at Phase 11):

| Provider | Variables | Kind | Notes |
|---|---|---|---|
| **eSewa ePay v2** | `ESEWA_ENV`, `ESEWA_PRODUCT_CODE`, `ESEWA_SECRET_KEY`, `ESEWA_FORM_URL`, `ESEWA_STATUS_URL` | 🔐 | HMAC-SHA256 (base64) signature over `total_amount,transaction_uuid,product_code`; redirect returns base64 JSON that must be signature-checked **and** confirmed via the status-check API. Statuses: PENDING, COMPLETE, FULL_REFUND, PARTIAL_REFUND, AMBIGUOUS, NOT_FOUND, CANCELED. Public UAT product code/secret are published on developer.esewa.com.np (used only in dev). |
| **Public website** | `PUBLIC_WEB_URL`, `API_BASE_URL`, `API_PUBLIC_URL`, `PAYMENT_RETURN_URL_WEB`, `TRUST_PROXY` | 🔓 | ✅ wired (T-053). `PUBLIC_WEB_URL` = the website (development `http://localhost:3000`; production `https://<domain>`): share links, canonical links, Secure cookies on https. The website's server reaches the API at `API_BASE_URL`; browsers at `API_PUBLIC_URL` (receipts; empty = `API_BASE_URL`). `PAYMENT_RETURN_URL_WEB` = `<website>/payment-result`. In production the API must trust the website's server and the reverse proxy (`TRUST_PROXY` = their addresses / CIDR ranges; `true` is refused there — Phase 15) so rate limits see visitors; the website sits behind the reverse proxy, which adds each visitor's real address. |
| **Payments (all gateways)** | `PAYMENT_CALLBACK_BASE_URL`, `PAYMENT_RETURN_URL_APP`, `PAYMENT_RETURN_URL_WEB`, `PAYMENT_ORDER_TTL_MINUTES` | 🔓 | ✅ wired (T-049). Production: the API's public **https** origin (gateways send students back to it), the app deep link (`tayarikakshya://payment-result`) and the website's `/payment-result` page. Going live is a `.env` change: set `ESEWA_ENV` / `KHALTI_ENV` to `production` with the merchant's keys (a production server refuses sandbox gateways). |
| **Khalti ePayment (KPG-2)** | `KHALTI_ENV`, `KHALTI_SECRET_KEY`, `KHALTI_BASE_URL` | 🔐 | `POST /epayment/initiate/` (amount in **paisa**, min Rs 10) → `pidx` + `payment_url`; verify with `POST /epayment/lookup/`; only `Completed` is success; also Pending, Refunded, Expired, User canceled, Partially Refunded. Sandbox keys from test-admin.khalti.com; live keys from admin.khalti.com. |
| **ConnectIPS (NCHL)** — 🔶 not implemented (names are a draft) | `CONNECTIPS_ENV`, `CONNECTIPS_MERCHANT_ID`, `CONNECTIPS_APP_ID`, `CONNECTIPS_APP_NAME`, `CONNECTIPS_APP_PASSWORD`, `CONNECTIPS_PFX_PATH` or `CONNECTIPS_PFX_BASE64`, `CONNECTIPS_PFX_PASSPHRASE`, `CONNECTIPS_GATEWAY_URL`, `CONNECTIPS_VALIDATE_URL` | 🔐 | Form POST to `/connectipswebgw/loginpage`; TOKEN = SHA256withRSA signature (private key from merchant PFX) base64; amount in paisa; success/failure URLs pre-registered with NCHL; transaction must be validated server-side via the validation API (exact endpoint/auth to confirm at Phase 11). Merchant onboarding via NCHL through a bank. |
| Common | `PAYMENT_CALLBACK_BASE_URL`, `PAYMENT_ORDER_TTL_MINUTES` | 🔓 | Public HTTPS callback URLs (staging + prod) needed for gateway registration. |

## 4. Storage, video, push, monitoring

| Variable | Kind | Phase | Notes |
|---|---|---|---|
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET_PUBLIC`, `S3_BUCKET_PRIVATE`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`, `PUBLIC_MEDIA_BASE_URL` | 🔐 | 6 | Cloudflare R2 in staging/production. Local dev + CI use SeaweedFS (dev-only keys in `infra/docker/seaweedfs/s3.json`); also `S3_FORCE_PATH_STYLE`, `PUBLIC_MEDIA_BASE_URL`, `PUBLIC_MEDIA_PROXY` (dev only), `STORAGE_AUTO_CREATE_BUCKETS` (dev only), `MEDIA_MAX_IMAGE_MB`, `MEDIA_MAX_PDF_MB` |
| `YOUTUBE_API_KEY` (optional — import title/duration/thumbnail for YouTube-hosted free videos) | 🔐 | 6 | owner's Google Cloud project |
| `BUNNY_STREAM_LIBRARY_ID`, `BUNNY_STREAM_API_KEY`, `BUNNY_STREAM_TOKEN_KEY` (required in staging/production with a library), `BUNNY_CDN_HOSTNAME`, `VIDEO_PLAYBACK_TTL_SECONDS` | 🔐 | 6 | Bunny Stream for premium video (D-015). **Provided** (local `.env`). Until set, Bunny items return `VIDEO_PROVIDER_NOT_CONFIGURED`. `VIDEO_PLAYBACK_TTL_SECONDS` sets signed-embed lifetime (default 300 s; T-031). |
| `EXPO_ACCESS_TOKEN` (push, optional), `GOOGLE_SERVICES_JSON` (EAS file variable, Android), FCM V1 service account key and APNs key (both uploaded to / created by EAS credentials — not environment variables) | 🔐 | 12 | Android + iOS both in scope (D-004). `EXPO_ACCESS_TOKEN` is optional (only with Expo "enhanced push security"); FCM / APNs credentials are uploaded to EAS, not to the API. `EXPO_PUSH_URL` defaults to Expo's endpoint. The app needs `EAS_PROJECT_ID` at build time (KI-048) |
| `SENTRY_DSN_API`, `VITE_SENTRY_DSN` (CMS), `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` (EAS secret), `APP_RELEASE` | 🔐/🔓 | 4 | DSNs are semi-public; auth token is secret (release builds only). **All provided** (projects: API = Node.js, app = React Native, admin = React). Admin reads `VITE_SENTRY_DSN` (`apps/admin/.env`), app `EXPO_PUBLIC_SENTRY_DSN`. Check the API with `cli monitoring-test` |
| `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_HOST` (app only; no server-side PostHog) | 🔓 | 8 | approved (D-039). **Provided** (US cloud). Server-side use comes with the website |

## 5. Mobile build & release

| Item | Phase | Who | Notes |
|---|---|---|---|
| App identifiers (`com.<org>.<app>`) | 8 | owner decides | cannot change after store release |
| Expo account / EAS project ID | 8 | owner | ✅ 2026-10-07 — `prashantdhimals-team / tayari-kakshya` (public id, committed in `app.config.ts`) |
| Apple Developer Program membership (iPhone test builds, TestFlight, App Store) | 12 / 20 | owner | needed before any iOS build; EAS makes the certificates and APNs key |
| Android upload keystore | 20 | generated, stored in EAS/secret store | never committed |
| Google Play Console account (organisation) | 20 | owner | org account requires D-U-N-S; personal accounts have testing requirements |
| Apple Developer Program + App Store Connect | 18 | owner | required (iOS in scope) |
| `EXPO_PUBLIC_API_URL` | 8 | me | `EXPO_PUBLIC_*` values are embedded in the app — **never secrets**. Builds only: in development it is left empty and the app uses port 4000 on the computer running Expo |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | 8 | owner (same Google Cloud project as `GOOGLE_OAUTH_*`) | public client ids; Google button hidden until set (KI-029). **Web id provided** — its OAuth client lists `http://localhost:8081` (authorized JavaScript origin **and** redirect URI — the app returns to its own origin; verified 2026-10-04). Android/iOS clients need the package / bundle id (L5) and, for Android, the signing key's SHA-1 |
| `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_HOST` | 8 | owner | app crash reports / analytics (KI-028). PostHog and Sentry **provided** (in `apps/mobile/.env`) |

## 6. CI/CD & hosting

GitHub Actions secrets per environment; hosting account access; DNS management; TLS certificates (managed);
backup storage location and retention (Q36).

## 7. Local development prerequisites (this machine, checked 2026-10-02)

| Tool | Status |
|---|---|
| Node.js | ✅ v24.15.0 |
| npm | ✅ 11.12.1 |
| pnpm | ❌ not installed (can enable via `corepack enable`) |
| Git | ✅ (user: Prashant Dhimal) |
| GitHub CLI `gh` | ❌ not installed (not required; push uses git credentials) |
| Docker | ❌ not installed (Q41) |
| PostgreSQL / psql | ❌ not installed (Q41) |
| Android Studio / emulator | unknown (Q41) |
