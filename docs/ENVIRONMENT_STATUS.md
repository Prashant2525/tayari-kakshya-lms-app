# Environment Status

Last checked: 2026-10-02 (Phase 4). Requirements inventory: `ENVIRONMENT_REQUIREMENTS.md`.

## Local machine
| Item | Status |
|---|---|
| OS / hardware | Windows 11 Home; 28 logical CPUs; 16 GB RAM |
| Node.js / npm | ✅ v24.15.0 / 11.12.1 |
| pnpm | ✅ 12.8.1 (`npm i -g pnpm@12.8.1`; corepack needs admin rights) |
| Git | ✅ configured (Prashant Dhimal) |
| GitHub remote / push | ✅ `origin` → https://github.com/Prashant2525/tayari-kakshya-lms-app.git — push over HTTPS works |
| GitHub CLI `gh` | ⚠️ installed (`C:\\Program Files\\GitHub CLI`), not authenticated in the agent shell (KI-019) |
| WSL2 | ✅ installed |
| CPU virtualization | ✅ working (Docker runs) |
| Docker Desktop | ✅ 29.8.1, Compose v5.5.1 |
| PostgreSQL / Redis / Mailpit | ✅ `pnpm infra:up` (Postgres 17.11 + test DB, Redis 7.4, Mailpit UI :8025) |
| Smart App Control | ⚠️ blocks unsigned native Node binaries (KI-011) |
| Android SDK | ✅ present (`%LOCALAPPDATA%\Android\Sdk`); Android Studio installed per owner |
| Playwright Chromium | ✅ installed (`pnpm --filter @tk/admin exec playwright install chromium`) |
| Python 3.14 + PyMuPDF | ✅ (discovery tooling only) |

## Owner action: install Docker Desktop (Windows Home → WSL2 backend)
1. Enable virtualization (Intel VT-x / AMD SVM) in BIOS/UEFI if Task Manager → Performance → CPU shows "Virtualization: Disabled".
2. In an **administrator** PowerShell: `wsl --install` → reboot.
3. Install Docker Desktop: `winget install -e --id Docker.DockerDesktop` (or the installer from docker.com) → keep "Use WSL 2" checked → reboot if asked.
4. Start Docker Desktop once, accept terms, then verify: `docker version` and `docker run --rm hello-world`.
5. Tell me when done — I'll run the Phase 4 Compose stack.
Note: Docker Desktop is free for small businesses (<250 employees and <$10M revenue) under its subscription terms.

## Service credentials
| Service | Sandbox | Production | Needed by |
|---|---|---|---|
| PostgreSQL / Redis | local Docker | Nepal VPS (L4) | Phase 4 / 18 |
| Email provider | Mailpit (local) | — (L1) | Phase 4 local, real by Phase 12 |
| SMS provider | — (L1) | — | when phone OTP is enabled |
| Google OAuth client IDs | — | — | Phase 8 |
| eSewa | public UAT values (developer.esewa.com.np) | — (owner has merchant account) | Phase 11 |
| Khalti | — (test-admin.khalti.com merchant) | — (owner has merchant account) | Phase 11 |
| ConnectIPS | — | — | Phase 14 (later) |
| Cloudflare R2 | SeaweedFS (local + CI) | — | Phase 6 local / 18 |
| Bunny Stream | — | **Provided 2026-10-02** (library 768559): in the owner's local `.env` only; API key verified (HTTP 200). Set the same values on the server in Phase 18. Tests always run with Bunny disabled. | Phase 6 |
| YouTube Data API key (optional, metadata import) | — | — | Phase 6 |
| Expo / EAS, FCM, APNs | — | — | Phase 8 / 12 |
| Sentry, PostHog | — | — | Phase 8 |
| VPS, domain, DNS | — | — (L4) | Phase 18 |
