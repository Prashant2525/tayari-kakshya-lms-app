# Test Status

Last updated: 2026-10-02 (Phase 5). `pnpm test` runs unit + integration suites (needs `pnpm infra:up`);
`pnpm build && pnpm --filter @tk/admin e2e` runs the browser suite.

## Current results — all passing locally

| Package | Tests | Kind |
|---|---|---|
| `@tk/design-tokens` | 39 | WCAG contrast for every text/background pair (light + dark), CSS generation |
| `@tk/domain` | 19 | BS calendar, Kathmandu day boundary, fiscal year, money/VAT/discounts |
| `@tk/contracts` | 5 | Schema behaviour (localized text, email normalisation, mass assignment, settings defaults) |
| `@tk/api` | 71 | Integration against real PostgreSQL + Redis through the HTTP stack; TOTP RFC 6238 vectors; RBAC unit |
| `@tk/admin` (unit) | 11 | API client (headers, refresh single-flight, retry, session loss, error mapping), BS formatting, Button `asChild` regression |
| `@tk/admin` (E2E, Playwright) | 3 | Real browser + real API + `*_e2e` database |
| **Total** | **148** | |

### Added in Phase 5
- **API:** staff MFA (forced enrolment by policy, wrong/valid codes, recovery codes single-use + audited, replay of a TOTP step rejected, forged challenge rejected, challenge is not an access token, encrypted secret at rest, disable requires a code, `all_staff` policy); education levels (permission, bilingual create, public active-only ordered list, reorder validation, in-use delete blocked, inactive level rejected on profile, audited); dashboard counts; audit actor names; staff MFA flag.
- **Browser E2E:** wrong password; forced 2FA enrolment with hidden navigation and route redirect; invalid then valid TOTP; 10 recovery codes; sign-in with TOTP; empty code field (regression); session survives reload; create role with a permission; invite staff with that role (pending invitation shown); create bilingual education level; save a setting; audit log shows the actions; sign-out protects routes.

### Bugs caught by verification this phase
- Contrast test: light danger-on-soft and dark primary-hover failed AA → tokens fixed.
- Browser walkthrough: `Button asChild` crashed Roles/Not-found pages (Slot received two children) → fixed + unit test.
- Browser walkthrough: 2FA code field showed the email (reused uncontrolled input) → keyed forms + E2E assertion.
- Browser walkthrough: dashboard query fired during forced 2FA (403) → `can()` mirrors the server rule.

## Not yet covered
- Load testing (Phase 16); content, exams, payments (later phases); student mobile app (Phase 8).
