# Test Status

Last updated: 2026-10-02 (Phase 6, content API). `pnpm test` runs unit + integration suites (needs `pnpm infra:up`);
`pnpm build && pnpm --filter @tk/admin e2e` runs the browser suite.

## Current results — all passing locally

| Package | Tests | Kind |
|---|---|---|
| `@tk/design-tokens` | 39 | WCAG contrast for every text/background pair (light + dark), CSS generation |
| `@tk/domain` | 24 | BS calendar, Kathmandu day boundary, fiscal year, money/VAT/discounts, access validity |
| `@tk/contracts` | 16 | Schema behaviour (localized text, email normalisation, mass assignment, settings defaults, rich-text validation) |
| `@tk/api` | 117 | Integration against real PostgreSQL + Redis + S3 (SeaweedFS) through the HTTP stack; TOTP RFC 6238 vectors; RBAC, video, watermark unit |
| `@tk/admin` (unit) | 11 | API client (headers, refresh single-flight, retry, session loss, error mapping), BS formatting, Button `asChild` regression |
| `@tk/admin` (E2E, Playwright) | 3 | Real browser + real API + `*_e2e` database |
| **Total** | **210** | |

### Added in Phase 6 (content API)
- **Media:** real-type sniffing rejects disguised files; images re-encoded to WebP variants with metadata stripped;
  PDFs forced private; size limits; in-use delete blocked; permission checks.
- **Content admin:** taxonomy tree + papers, subject → chapter → topic → item CRUD, reorder validation, soft delete and
  restore, publish workflow (editors submit for review; publish/schedule/archive need the publish permission; editing
  live content needs it too), scheduling validation, instructor scopes, course pricing permission, audit entries.
- **Catalog/learning:** drafts invisible; scheduled content appears when due; iOS never receives prices, Android only
  when the in-app channel is enabled; premium note bodies / PDF / video never sent without an entitlement
  (`CONTENT_LOCKED`); verification-required setting; revoked/expired grants lose access; archived courses stay visible
  to entitled students; watermarked PDF stream.
- **Free enrolment (D-043):** locked until enrol; access for the course validity; idempotent under 5 concurrent
  taps (one row); paid / closed / unpublished refused; students only; audited. Mutation check: dropping the
  price guard fails the suite.
- **Unit:** access validity (days, fixed date ends at Nepal midnight, lifetime, invalid input), YouTube URL parsing, ISO durations, Bunny signed-embed token, PDF watermark on every page.
- Mutation check: making `hasSubjectAccess` always true fails 3 catalog tests.

### Added in Phase 5
- **API:** staff MFA (forced enrolment by policy, wrong/valid codes, recovery codes single-use + audited, replay of a TOTP step rejected, forged challenge rejected, challenge is not an access token, encrypted secret at rest, disable requires a code, `all_staff` policy); education levels (permission, bilingual create, public active-only ordered list, reorder validation, in-use delete blocked, inactive level rejected on profile, audited); dashboard counts; audit actor names; staff MFA flag.
- **Browser E2E:** wrong password; forced 2FA enrolment with hidden navigation and route redirect; invalid then valid TOTP; 10 recovery codes; sign-in with TOTP; empty code field (regression); session survives reload; create role with a permission; invite staff with that role (pending invitation shown); create bilingual education level; save a setting; audit log shows the actions; sign-out protects routes.

### Bugs caught by verification this phase
- Contrast test: light danger-on-soft and dark primary-hover failed AA → tokens fixed.
- Browser walkthrough: `Button asChild` crashed Roles/Not-found pages (Slot received two children) → fixed + unit test.
- Browser walkthrough: 2FA code field showed the email (reused uncontrolled input) → keyed forms + E2E assertion.
- Browser walkthrough: dashboard query fired during forced 2FA (403) → `can()` mirrors the server rule.

### Bugs caught by verification in Phase 6
- Watermark label contained a double space after stripping non-ASCII characters → whitespace collapsed.

## Not yet covered
- Admin CMS content screens and their E2E tests (next).
- Load testing (Phase 16); content, exams, payments (later phases); student mobile app (Phase 8).
