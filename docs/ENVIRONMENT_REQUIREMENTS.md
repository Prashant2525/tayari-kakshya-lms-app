# Environment Requirements

Status: **No credentials received yet.** None are needed until the matching phase begins. Launch gateways: eSewa + Khalti (D-003); ConnectIPS later (Phase 14). Analytics: PostHog (D-039).
Rules: never commit real values; `.env*` files are git-ignored except `.env.example`; production secrets live in the
hosting provider's secret manager / GitHub Actions secrets; sandbox/test credentials are used until production
credentials are explicitly provided by the owner.

Legend: 🔐 secret · 🔓 non-secret config · Phase = when it is first needed.

## 1. Core platform

| Variable | Kind | Phase | Who provides | Notes |
|---|---|---|---|---|
| `NODE_ENV`, `APP_ENV` | 🔓 | 4 | me | `development` / `staging` / `production` |
| `API_BASE_URL`, `ADMIN_BASE_URL`, `PUBLIC_WEB_URL` | 🔓 | 4 | owner (domains, Q36) | |
| `CORS_ALLOWED_ORIGINS` | 🔓 | 4 | me | admin + web origins only |
| `DATABASE_URL` | 🔐 | 4 | owner/hosting (local: me) | PostgreSQL 17, `sslmode=require` in prod |
| `DATABASE_DIRECT_URL` | 🔐 | 4 | hosting | for migrations if a pooler is used |
| `REDIS_URL` | 🔐 | 4 | hosting (local: me) | rate limits, cache, BullMQ |
| `JWT_ACCESS_SECRET` (or `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY`) | 🔐 | 4 | generated per env | never reused across envs |
| `REFRESH_TOKEN_PEPPER` | 🔐 | 4 | generated | refresh tokens stored hashed |
| `ENCRYPTION_KEY` | 🔐 | 4 | generated | field-level encryption (e.g. 2FA secrets) |

## 2. Identity & messaging

| Variable | Kind | Phase | Who provides | Notes |
|---|---|---|---|---|
| `GOOGLE_OAUTH_WEB_CLIENT_ID`, `GOOGLE_OAUTH_ANDROID_CLIENT_ID`, `GOOGLE_OAUTH_IOS_CLIENT_ID` | 🔓 | 8 | owner's Google Cloud project | Android requires SHA-1 of signing key |
| `EMAIL_PROVIDER`, `EMAIL_FROM`, `SMTP_HOST/PORT/USER/PASSWORD` or `RESEND_API_KEY`/`SES_*` | 🔐 | 4 | owner | verified sending domain (SPF/DKIM/DMARC) |
| `SMS_PROVIDER`, `SMS_API_KEY`, `SMS_SENDER_ID` | 🔐 | when phone verification is enabled (D-029, L1) | owner | Nepal providers e.g. Sparrow SMS, Aakash SMS — sender ID/template approval required |

## 3. Payments (Phase 11 — re-verify official docs before coding)

Verified against official docs on 2026-10-02 (summary; full re-check required at Phase 11):

| Provider | Variables | Kind | Notes |
|---|---|---|---|
| **eSewa ePay v2** | `ESEWA_ENV`, `ESEWA_PRODUCT_CODE`, `ESEWA_SECRET_KEY`, `ESEWA_FORM_URL`, `ESEWA_STATUS_URL` | 🔐 | HMAC-SHA256 (base64) signature over `total_amount,transaction_uuid,product_code`; redirect returns base64 JSON that must be signature-checked **and** confirmed via the status-check API. Statuses: PENDING, COMPLETE, FULL_REFUND, PARTIAL_REFUND, AMBIGUOUS, NOT_FOUND, CANCELED. Public UAT product code/secret are published on developer.esewa.com.np (used only in dev). |
| **Khalti ePayment (KPG-2)** | `KHALTI_ENV`, `KHALTI_SECRET_KEY`, `KHALTI_BASE_URL` | 🔐 | `POST /epayment/initiate/` (amount in **paisa**, min Rs 10) → `pidx` + `payment_url`; verify with `POST /epayment/lookup/`; only `Completed` is success; also Pending, Refunded, Expired, User canceled, Partially Refunded. Sandbox keys from test-admin.khalti.com; live keys from admin.khalti.com. |
| **ConnectIPS (NCHL)** | `CONNECTIPS_ENV`, `CONNECTIPS_MERCHANT_ID`, `CONNECTIPS_APP_ID`, `CONNECTIPS_APP_NAME`, `CONNECTIPS_APP_PASSWORD`, `CONNECTIPS_PFX_PATH` or `CONNECTIPS_PFX_BASE64`, `CONNECTIPS_PFX_PASSPHRASE`, `CONNECTIPS_GATEWAY_URL`, `CONNECTIPS_VALIDATE_URL` | 🔐 | Form POST to `/connectipswebgw/loginpage`; TOKEN = SHA256withRSA signature (private key from merchant PFX) base64; amount in paisa; success/failure URLs pre-registered with NCHL; transaction must be validated server-side via the validation API (exact endpoint/auth to confirm at Phase 11). Merchant onboarding via NCHL through a bank. |
| Common | `PAYMENT_CALLBACK_BASE_URL`, `PAYMENT_ORDER_TTL_MINUTES` | 🔓 | Public HTTPS callback URLs (staging + prod) needed for gateway registration. |

## 4. Storage, video, push, monitoring

| Variable | Kind | Phase | Notes |
|---|---|---|---|
| `STORAGE_DRIVER`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET_PUBLIC`, `S3_BUCKET_PRIVATE`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `CDN_BASE_URL` | 🔐 | 6 | Cloudflare R2 in staging/production. Local dev + CI use SeaweedFS (dev-only keys in `infra/docker/seaweedfs/s3.json`); also `S3_FORCE_PATH_STYLE`, `PUBLIC_MEDIA_BASE_URL`, `PUBLIC_MEDIA_PROXY` (dev only), `STORAGE_AUTO_CREATE_BUCKETS` (dev only), `MEDIA_MAX_IMAGE_MB`, `MEDIA_MAX_PDF_MB` |
| `YOUTUBE_API_KEY` (optional — import title/duration/thumbnail for YouTube-hosted free videos) | 🔐 | 6 | owner's Google Cloud project |
| `VIDEO_PROVIDER`, `BUNNY_STREAM_LIBRARY_ID`, `BUNNY_STREAM_API_KEY`, `BUNNY_STREAM_TOKEN_KEY`, `BUNNY_CDN_HOSTNAME` (or `CF_STREAM_*`) | 🔐 | 6 | Bunny Stream for premium video (D-015). **Needed from owner.** Until set, Bunny items return `VIDEO_PROVIDER_NOT_CONFIGURED`. `VIDEO_PLAYBACK_TTL_SECONDS` sets signed-embed lifetime (default 300 s; T-031). |
| `EXPO_ACCESS_TOKEN` (push), FCM service account (`FIREBASE_SERVICE_ACCOUNT_JSON`), APNs key (`APNS_KEY_ID`, `APNS_TEAM_ID`, `.p8`) | 🔐 | 12 | Android + iOS both in scope (D-004) |
| `SENTRY_DSN_API`, `SENTRY_DSN_ADMIN`, `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` | 🔐/🔓 | 4 | DSNs are semi-public; auth token is secret |
| `POSTHOG_API_KEY`, `POSTHOG_HOST` | 🔓 | 8 | approved (D-039) |

## 5. Mobile build & release

| Item | Phase | Who | Notes |
|---|---|---|---|
| App identifiers (`com.<org>.<app>`) | 8 | owner decides | cannot change after store release |
| Expo account / EAS project ID | 8 | owner | |
| Android upload keystore | 20 | generated, stored in EAS/secret store | never committed |
| Google Play Console account (organisation) | 20 | owner | org account requires D-U-N-S; personal accounts have testing requirements |
| Apple Developer Program + App Store Connect | 18 | owner | required (iOS in scope) |
| `EXPO_PUBLIC_API_URL` | 8 | me | `EXPO_PUBLIC_*` values are embedded in the app — **never secrets**. Emulator: `http://10.0.2.2:4000`; phone: the computer's LAN address |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | 8 | owner (same Google Cloud project as `GOOGLE_OAUTH_*`) | public client ids; Google button hidden until set (KI-029) |
| `EXPO_PUBLIC_SENTRY_DSN`, PostHog project key | 8 | owner | app crash reports / analytics (KI-028) |

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
