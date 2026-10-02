# Known Issues, Risks & Technical Debt

| ID | Type | Description | Impact | Status |
|---|---|---|---|---|
| KI-001 | Repo | 51 MB design PDF was committed on `main`. | Large clones | **Mitigated** — untracked going forward (D-041); remains in old history by owner choice (no rewrite). |
| KI-002 | Repo | `README.md` was UTF-16 encoded. | Cosmetic | **Resolved** in Phase 4 (rewritten as UTF-8). |
| KI-003 | Store-policy risk | Android in-app eSewa/Khalti for digital content conflicts with Google Play's billing policy text, although Play Billing is unavailable to Nepal-based merchants; iOS web-only purchasing may be challenged under Apple 3.1.1/3.1.3(b). | Store rejection/enforcement | **Accepted by owner** (D-027). Mitigations: purchase channels are server-side settings (switch to web-only without a release); website checkout always available; Apple IAP can be added. Re-check policies before store submission. |
| KI-004 | Legal risk | Official emblems (Police/Army/APF/NID) on category tiles; owner did not confirm permission. Gorkhapatra resolved (team summaries only, D-018). | Takedown risk | Open — emblems are CMS uploads chosen by the owner; reminder in launch checklist. |
| KI-005 | Reference gaps | PDF lacks course detail, checkout, exam flow, results, news detail, empty/error states. | New design needed | Covered in `FEATURE_SPECIFICATION.md` v1.0 + `DESIGN_SYSTEM.md` §8. |
| KI-006 | Reference copy | Copy errors in PDF ("Forget your password?", reset button "Send email", duplicated tiles). | Must not be copied | Note for implementation. |
| KI-007 | Environment | No Docker / WSL2 on dev machine. | Blocked Phase 4 | **Resolved** — owner installed Docker Desktop 29.8 + WSL2. |
| KI-008 | Scale | Weekly exams create synchronized bursts. | Outage risk | Designed for (ARCHITECTURE §8); load test in Phase 16. |
| KI-009 | Video security | YouTube-hosted videos (free/promo) can be watched outside the app by anyone with the ID. | Leakage of free content only | Accepted (D-015); CMS warns if YouTube is used for premium. |
| KI-010 | Payments | Nepali wallets do not support recurring auto-debit; renewals are manual. | Plan renewals need reminders | Design: expiry reminders via notifications. |
| KI-011 | Environment | Windows **Smart App Control** blocks unsigned native Node binaries (e.g. `@swc/core`). | Some native dev tools unusable locally | Mitigated (T-017). Check new native deps on this machine early. |
| KI-012 | Dates | BS conversion library covers **BS 2000–2090 (≈ AD 1943–2034)**; dates outside throw `BsDateRangeError`. | Must update data/library before ~2033 | Open — long-term. |
| KI-013 | Auth | Staff invitation email reuses the password-reset OTP copy ("Your password reset code"). | Slightly confusing wording for new staff | Open — dedicated invite template with CMS templates (Phase 12). |
| KI-014 | Auth | TOTP 2FA for staff. | — | **Resolved** in Phase 5 (T-022). |
| KI-015 | Logging | Worker/CLI use Nest's default console logger rather than structured Pino JSON. | Less structured worker logs | Open — align in Phase 18 (observability). |
| KI-016 | Profile | Education level CRUD. | — | **Resolved** in Phase 5 (admin page + API). |
| KI-017 | CI | First GitHub Actions run. | — | **Resolved** — owner confirmed CI green for PR #3. New `admin-e2e` job to be confirmed on the Phase 5 PR. |
| KI-018 | Admin performance | Main admin JS chunk ≈ 548 KB (172 KB gzip); the note editor (TipTap) is a separate lazy chunk of 490 KB (154 KB gzip) loaded only on item pages. | Slower first load of the internal CMS on slow links | Open — split vendor chunks (Radix/TanStack) before launch. |
| KI-019 | Tooling | GitHub CLI not authenticated in the agent's shell. | — | **Resolved** — owner ran `gh auth login`. |
| KI-020 | Admin UX | Visiting the login page with no session logs one expected 401 (refresh-cookie probe) in the browser console. | Cosmetic (console only) | Accepted. |
| KI-021 | CI | On `aeef198` the CI `verify` job failed one media test (private PDF upload → 500): SeaweedFS was not ready. | — | **Resolved** — readiness wait on `/dir/assign` + `-volume.max=0`; CI green on `e6bf6b4` and `597f722`. |
| KI-023 | Video security | Signed Bunny embeds only protect premium video if **Token Authentication** is switched on in the Bunny library's Security settings (and ideally allowed referrers/domains). **Verified 2026-10-02 with the owner's uploaded videos: token authentication is OFF** — the player page is identical for a valid, forged or expired token, and the HLS playlist loads with no token and any `Referer` (only requests with no Referer get 403). | **Premium video currently playable by anyone who knows the video id** | **Partly resolved 2026-10-03** — owner enabled embed token authentication; re-check: signed embed 200, unsigned/forged/expired 403 (also confirms our token formula). Still open: the CDN playlist loads without a token for any Referer, so an entitled viewer could share the direct stream URL — **owner action**: enable *CDN token authentication* and set allowed domains, then re-check (thumbnail URLs will need signing). |
| KI-022 | Performance | PDF watermarks are generated on every request (whole file loaded in memory). | CPU/memory for large PDFs under load | Open — cache per student+file or stream-stamp before Phase 16 load test. |
| KI-024 | Admin UX | Categories and papers use simple lists with up/down ordering; the generic data table, drag-and-drop and the command palette (⌘K) are not built yet. | Slower for large catalogues | Open — later in Phase 6 / polish. |
