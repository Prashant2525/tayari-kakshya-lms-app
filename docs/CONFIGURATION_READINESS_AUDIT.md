# Configuration Readiness Audit

**Requirement (owner, 2026-10-13, D-076):** zero code changes for configuration. Once the owner supplies credentials and
environment values (`.env` / server environment / EAS), every integration must work — development, sandbox and
production — without code changes. Every variable documented; configuration validated with clear errors; integrations
fully implemented and tested (no fake implementations, no "adding keys completes it"); sandbox / production handled
safely; no secrets in clients, logs, git or docs; unavoidable manual steps written as exact instructions.

Audited against the code on `main` after PR #59 (2026-10-13). Legend: ✅ meets the requirement · ⚠️ gap (fixed by the
plan in §3) · 📝 manual step outside the code (instructions in the guide).

## 1. Integration matrix

| Integration | Configuration (where) | Sandbox → production | Validated at start-up / `config-check` | Implemented + tested | Manual steps | Verdict |
|---|---|---|---|---|---|---|
| PostgreSQL | `DATABASE_URL`, `DATABASE_POOL_MAX` (server env); compose `POSTGRES_*` | same code; per-environment database | ✅ required; `--connect` checks migrations | ✅ all API tests on PostgreSQL | 📝 password generation (§3.15) | ✅ |
| Redis | `REDIS_URL`; compose `REDIS_PASSWORD` | same | ✅ required; `--connect` PING | ✅ | — | ✅ |
| Auth (sessions, OTP, 2FA) | `JWT_ACCESS_SECRET`, `REFRESH_TOKEN_PEPPER`, `OTP_PEPPER`, `ENCRYPTION_KEY`, TTLs | per-environment secrets | ✅ length; distinct in staging / production | ✅ auth / mfa / verification tests | 📝 generate (§3.3) | ✅ |
| Google sign-in | API `GOOGLE_OAUTH_*_CLIENT_ID`; app `EXPO_PUBLIC_GOOGLE_*` (EAS) | client ids per platform | ✅ reported | ✅ token verification tested with a stand-in verifier; real web client verified in Phase 8 | 📝 Google Cloud OAuth clients, Android SHA-1 (§4.6) | ✅ |
| eSewa ePay v2 | `ESEWA_ENV`, `ESEWA_PRODUCT_CODE`, `ESEWA_SECRET_KEY` (+ optional URL overrides) | `ESEWA_ENV` picks the built-in endpoints | ✅ sandbox refused in production; public test merchant refused; https callback required · ⚠️ a **half-configured** gateway (secret without product code) is silently "off" | ✅ against eSewa's real UAT + gateway stand-in in browser tests | 📝 merchant credentials (§5.1) | ⚠️ G-3 |
| Khalti KPG-2 | `KHALTI_ENV`, `KHALTI_SECRET_KEY` (+ optional base URL) | `KHALTI_ENV` | ✅ as eSewa · ⚠️ the key itself is never tried before launch | ✅ against Khalti's real sandbox + stand-in | 📝 merchant key (§5.2) | ⚠️ G-4 |
| **ConnectIPS (NCHL)** | — | — | — | ❌ **not implemented** (paused by D-073; now required by D-076) | 📝 NCHL merchant onboarding, PFX key, registered URLs | ⚠️ **G-1** |
| Refunds | — | — | — | ✅ recorded in the CMS; money returned in the merchant portal (D-057) | 📝 portal steps | ✅ (by decision) |
| Bunny Stream | `BUNNY_STREAM_*`, `BUNNY_CDN_HOSTNAME`, `VIDEO_PLAYBACK_TTL_SECONDS` | per-library | ✅ token key required in staging / production; `--connect` lists videos | ✅ signed playback tested | 📝 library + token auth (§6) | ✅ |
| YouTube (free videos) | `YOUTUBE_API_KEY` (optional) | — | ✅ reported | ✅ | 📝 optional key | ✅ |
| Email (SMTP) | `EMAIL_PROVIDER`, `EMAIL_FROM`, `SMTP_*` | log provider refused in staging / production | ✅ host / port required; placeholder sender refused; `--connect` logs in | ✅ SMTP in every browser suite (Mailpit) | 📝 provider + SPF / DKIM / DMARC (§4.4) | ✅ |
| **SMS (phone codes)** | `SMS_PROVIDER` = `disabled` / `log` only | — | ✅ log refused in staging / production | ❌ **no real provider** — phone verification cannot be switched on with credentials alone | 📝 provider account, sender ID approval | ⚠️ **G-2** |
| Object storage (R2) | `S3_*`, `PUBLIC_MEDIA_BASE_URL` | SeaweedFS locally → R2 by values | ✅ https media URL, no dev proxy / bucket creation, local endpoint refused; `--connect` both buckets | ✅ | 📝 buckets, token, custom domain (§4.3) | ✅ |
| Push (Expo → FCM / APNs) | `EXPO_PUSH_URL`, `EXPO_ACCESS_TOKEN` (server); FCM / APNs in EAS credentials | same code | ✅ reported | ✅ with a stand-in push service; real device check pending (KI-054) | 📝 Firebase, APNs (§4.9) | ✅ |
| Sentry / PostHog | `SENTRY_DSN_API`, `VITE_SENTRY_DSN`, `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_POSTHOG_*` | per-environment labels | ✅ reported; `monitoring-test` | ✅ | 📝 projects exist | ✅ |
| Website | `API_BASE_URL`, `API_PUBLIC_URL`, `PUBLIC_WEB_URL` | values | ✅ start-up check (`instrumentation.ts`) | ✅ web browser suite | — | ✅ |
| CMS | `VITE_*` (build) | values | ✅ build fails on bad values | ✅ | — | ✅ |
| Student app | `EXPO_PUBLIC_*` + EAS environments | EAS *development / preview / production* | ✅ production build refuses a missing / http API URL | ✅ | 📝 EAS variables, store accounts | ✅ |
| Production stack | `infra/production/.env` (§3.15) | — | ✅ compose `:?` on required values; `config-check` | ✅ rehearsed (Phase 18) | 📝 VPS, DNS, firewall, off-site backup place | ⚠️ G-6 (instructions) |

## 2. Cross-cutting checks

| Check | Result |
|---|---|
| Every variable the code reads is in the guide and a `.env.example` | ✅ (guide §3 audit, Phase 17) — keep it with the PR rule below |
| Clear errors for missing / invalid values | ✅ start-up validation lists names and reasons without values; `config-check` · ⚠️ partial configurations (G-3) |
| Secrets in client code | ✅ the app reads only `EXPO_PUBLIC_*` (+ build-time names in `app.config.ts`), the CMS only `VITE_*`, the website server only addresses · ⚠️ no automated guard keeps it so (G-5) |
| Secrets in logs | ✅ authorization / cookies removed, secret URL parameters redacted, request bodies not logged |
| Secrets in git / docs | ✅ templates hold placeholders or published test values only; CI secret scan (GitGuardian) |
| Sandbox vs production | ✅ sandbox gateways refused in production, test merchant refused, log email / SMS refused, dev storage refused |
| Guide kept current | ✅ CLAUDE.md rule + guide §13 · ⚠️ nothing reminds a PR author (G-7) |

## 3. Gaps and plan (added to `IMPLEMENTATION_PLAN.md`, Phase 19)

| # | Gap | Severity | Work |
|---|---|---|---|
| G-1 | **ConnectIPS not implemented** | H | Provider behind the gateway interface per NCHL's e-Payment integration spec: form POST with `TOKEN` (SHA256withRSA, merchant private key), server-side `validatetxn` (Basic auth, signed body) before any access is granted, `gettxndetail` for reconciliation; `CONNECTIPS_ENV` (UAT / production built-in base URLs), merchant / app ids, app password, private key (PEM, converted from NCHL's PFX with one documented command); start-up validation, `config-check`, stand-in gateway for tests, app + website checkout, guide §5.3 with NCHL onboarding steps. To verify in NCHL UAT once test credentials arrive. |
| G-2 | **No real SMS provider** | M | Sparrow SMS and Aakash SMS adapters chosen by `SMS_PROVIDER` (`sparrow` / `aakash`), token + sender values, validation, `--connect` credit check, tests against stand-ins; guide §4.5 with sender-ID approval steps. Phone verification then becomes a CMS switch. |
| G-3 | Half-configured gateways / services are silently "off" | M | Start-up validation: eSewa product code and secret together; ConnectIPS all-or-nothing; SMTP user and password together; Bunny library and API key together; SMS token with a provider. |
| G-4 | Gateway credentials are not tried before launch | L | `config-check --connect`: Khalti key accepted (lookup of an unknown payment answers "not found", not 401); eSewa status endpoint reachable; ConnectIPS credentials accepted (`gettxndetail` of an unknown transaction); SMS credit. No payment is made. |
| G-5 | No automated guard against secrets in client code | L | Unit test: the app may read only `EXPO_PUBLIC_*` (+ a short list of build-time names in `app.config.ts`), the CMS only `VITE_*`, the website only its listed server values. |
| G-6 | Some manual steps are not yet exact | L (docs) | Guide: server preparation (Docker install, firewall), exact DNS records, off-site backups with rclone + an R2 bucket, Play / App Store first submission steps. |
| G-7 | No reminder to update the guide | L | Pull-request template with a configuration checkbox. |

Not gaps: refunds through merchant portals (D-057); offline video and the AI assistant (on hold, D-073 — no configuration
involved).

## 4. Status
Updated as each gap closes.

| Gap | Status |
|---|---|
| G-1 | ✅ built and tested against a signature-checking stand-in (API + app browser test); first real run in NCHL UAT when the owner has test credentials (guide §5.3) |
| G-2 | ✅ Sparrow SMS and Aakash SMS by `SMS_PROVIDER`; validation, token check in `config-check --connect`, tests against an HTTP stand-in (guide §4.5) |
| G-3 | ✅ start-up validation (`env.ts`), tests in `env.test.ts` |
| G-4 | ✅ `config-check --connect` tries Khalti, eSewa and ConnectIPS credentials without paying (checked against the real eSewa / Khalti sandboxes, a wrong Khalti key is reported) |
| G-5 | ✅ `env-usage.test.ts` in the app, CMS and website (checked by planting a violation) |
| G-6 | ✅ guide §8.0 (server, firewall, swap, off-site backups), §4.14 (DNS records), §4.13 (store submissions) |
| G-7 | ✅ `.github/pull_request_template.md` |
