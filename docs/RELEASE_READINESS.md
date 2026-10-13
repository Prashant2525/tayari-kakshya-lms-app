# Release Readiness

The go-live checklist (Phase 18). Each line is ✅ done, 🟡 waiting on the owner, or ☐ to do at launch. Details and
exact commands live in `ENVIRONMENT_AND_PRODUCTION_DEPLOYMENT_GUIDE.md` (the guide). Last updated: 2026-10-13.

**Verdict today: not ready to launch.** All approved features are built and tested; the production stack is built and
rehearsed. What remains is the owner's accounts and values (section 2), a staging run with a load test (section 3)
and the launch settings in the CMS (section 4).

## 1. Software and infrastructure

| Item | Status | Evidence |
|---|---|---|
| Approved features (FEATURE_SPECIFICATION, S1–S24) | ✅ | `PRODUCTION_READINESS_AUDIT.md`; audit findings F-01…F-13 fixed except F-11 (below) and F-02 / F-05 (owner: not now) |
| Automated tests | ✅ | `TEST_STATUS.md`: unit + API tests, CMS / app / website browser tests; CI green on `main` |
| Production images (API + worker, website, CMS in the proxy, migrations) | ✅ | `infra/production/Dockerfile`; CI job `docker-images` builds them on every push |
| One-server stack: Caddy (HTTPS, security headers, CMS CSP), API × `API_REPLICAS`, worker, website, PostgreSQL, Redis | ✅ | `infra/production/docker-compose.prod.yml`, `Caddyfile` |
| Deploy (backup → migrate → start → wait for ready), rollback, nightly encrypted backups with retention, restore drill | ✅ | `deploy.sh`, `rollback.sh`, `backup.sh`, `restore.sh`; rehearsed locally (guide §8.1) |
| Configuration check without printing values | ✅ | `node dist/cli.js config-check [--connect]` inside the API container |
| Several API processes for weekly-exam rushes (audit F-11) | ✅ built · ☐ sized | `API_REPLICAS`; size it from the staging load test (section 3) |
| ConnectIPS | 🟡 | Not built: needs NCHL test credentials (D-073) |
| Offline video, AI assistant | — | On hold by decision (D-073) |

## 2. Accounts and values only the owner can provide

| Needed for | What | Guide |
|---|---|---|
| Hosting | Nepal VPS (L4; 4 GB RAM or more — the image build needs it), domain, DNS records | §4.14, §8.1 |
| Backups | An off-site place for the encrypted backups (L4) + an rclone remote; keep `BACKUP_PASSPHRASE` in a password manager | §3.15, §8 step 16 |
| Email | Email provider (SMTP) and a verified sending domain (SPF / DKIM / DMARC) (L1) | §4.4 |
| Phone codes | SMS provider (L1) — optional; phone sign-up stays off without it | §4.5 |
| Payments | eSewa and Khalti **production** merchant keys; ConnectIPS later | §5 |
| Storage | Cloudflare R2 production buckets + `media.` custom domain | §4.3 |
| Video | Bunny Stream production library (token key required) | §6 |
| Sign-in | Google OAuth Android (release SHA-1) and iOS client ids | §4.6 |
| Push | Firebase (FCM) for Android, APNs key for iPhone (in EAS credentials) | §4.9 |
| Stores | Google Play Console and Apple Developer accounts (L5) | §4.13 |
| Monitoring | Sentry DSNs for production; an uptime service checking `https://api.<domain>/api/v1/health/ready` and the website | §4.10, §8 step 15 |
| Legal | Approval of the draft About / Terms / Privacy / Refund pages (D-038) | CMS → Pages |

## 3. Before launch, in order

1. ☐ **Staging**: the same stack on staging addresses (`APP_ENV=staging`, sandbox payments) — guide §7, §8.1.
2. ☐ `config-check` → 0 errors, then `config-check --connect` → all connections ok.
3. ☐ **Load test on staging** (never production): `apps/api/scripts/load/weekly-exam.mjs` with the expected number of
   students; raise `API_REPLICAS` (and `POSTGRES_MAX_CONNECTIONS`) until starts and submits stay fast (audit F-11).
4. ☐ Smoke tests on staging (guide §9), including sandbox payments and a refund.
5. ☐ App builds from the EAS *preview* profile against staging; test on a real Android phone and an iPhone (KI-054).
6. ☐ Production: deploy (§8.1), create the Super Admin, enrol two-factor, schedule `backup.sh nightly`, run
   `restore.sh … --drill` once.
7. ☐ Section 4 settings in the CMS.
8. ☐ Production smoke tests (§9) with **real small payments** and a refund.
9. ☐ Store builds (EAS *production*) → Play internal testing / TestFlight → review → release.

## 4. Launch settings in the CMS (business values — the owner decides)

Taxonomy and courses · prices, sale prices, validity · plans and what they include · coupons · VAT / PAN / receipt
prefix · refund policy text · **device limit** (default: no limit) · verification channels · staff two-factor policy
(SECURITY_REVIEW R-5) · purchase channels per platform (iPhone web-only, D-027) · assessment defaults · certificate
rules · contact options · legal pages · education levels · email texts · Home screen sections and campaign defaults
(confirm D-075).

## 5. Go / no-go

Launch when: sections 2–4 are complete; CI is green on the release commit; `config-check --connect` shows 0 errors on
production; the production smoke tests pass, including a real payment and refund on every enabled gateway; the
nightly backup has run and a restore drill passed; the uptime check and Sentry are receiving data.

## 6. After launch

Daily: Sentry and the uptime service. Weekly: CMS reports, failed notification deliveries, refunds. Monthly:
`restore.sh <latest> --drill`; update the server (`apt upgrade`, then `deploy.sh --no-build` if Docker restarted);
review `docker image ls tayari-kakshya/*` and remove releases older than the last five.
