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
| KI-014 | Auth | Optional TOTP 2FA for staff (ARCHITECTURE §4) not implemented yet. | Super Admin protected by password only | Planned for Phase 5. |
| KI-015 | Logging | Worker/CLI use Nest's default console logger rather than structured Pino JSON. | Less structured worker logs | Open — align in Phase 18 (observability). |
| KI-016 | Profile | Education levels table exists but has no CMS CRUD yet; `PATCH /me` validates against it. | Students cannot pick a level until the CMS adds levels | Planned for Phase 5. |
| KI-017 | CI | The GitHub Actions workflow has not yet been observed passing on GitHub (see push result). | Unverified CI | Check the first run after push. |
