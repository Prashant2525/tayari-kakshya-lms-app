# Test Status

Last updated: 2026-10-03 (Phase 7, question bank backend). `pnpm test` runs unit + integration suites (needs `pnpm infra:up`);
`pnpm build && pnpm --filter @tk/admin e2e` runs the browser suite.

## Current results — all passing locally

| Package | Tests | Kind |
|---|---|---|
| `@tk/design-tokens` | 39 | WCAG contrast for every text/background pair (light + dark), CSS generation |
| `@tk/domain` | 39 | BS calendar, Kathmandu day boundary, fiscal year, money/VAT/discounts, access validity |
| `@tk/contracts` | 21 | Schema behaviour (localized text, email normalisation, mass assignment, settings defaults, rich-text validation) |
| `@tk/api` | 141 | Integration against real PostgreSQL + Redis + S3 (SeaweedFS) through the HTTP stack; TOTP RFC 6238 vectors; RBAC, video, watermark unit |
| `@tk/admin` (unit) | 33 | API client (headers, refresh single-flight, retry, session loss, error mapping), BS formatting, Button `asChild` regression |
| `@tk/admin` (E2E, Playwright) | 17 | Real browser + real API + `*_e2e` database |
| **Total** | **290** | |

### Added with the dynamic admin audit
- **Bug caught by CI:** concurrent free-enrol taps could create two entitlements — the request that waited on the
  lock checked with an earlier timestamp than the new row's start. Fixed (any active, unexpired access counts) with a
  deterministic regression test that fails on the old check.
- **API:** PSC-style tree with sub-group and exam stage; hierarchy rules read from the types table; papers on exam
  stages; type rank/flag changes refused when existing categories would break; in-use types cannot be deleted; off
  types unusable for new categories; only taxonomy managers edit types; disabled question types refused; labels in
  `/app/config`; template download with live lists (questions:edit only).
- **Unit:** template sheets/columns/version, dropdowns and numeric validations survive a write/read round trip, every
  example row (all 7 types) parses into valid content, row parser reports the exact column for each problem.
- **Migration check:** on a scratch database with categories, `exam_node_types` kept every node's type, dropped the
  old enum and rejected an unknown type.
- **Browser E2E:** category types page (add a level, rename an in-use type, exam stage offered under a post);
  template download from the Question bank.

### Added in Phase 7 (question bank admin screens)
- **Unit:** every question type round-trips API → editor → API unchanged; readable validation messages; blank and
  id helpers.
- **Browser E2E:** single-choice question (required-field errors, options, correct answer, Nepali stem, explanation,
  marks, tags, PYQ year), reload persistence, content edits create versions 2 and 3, publish, list filters/search;
  fill-in-the-blank via "Insert blank"; a student report resolved (rejected with a note) in the reports queue.
- **API:** course/question editors can read categories, papers and subject outlines but not change them.
- Bugs caught: list previews showed option text and raw `[[b1]]` placeholders → stem-only previews with ____.

### Added in Phase 7 (question bank backend)
- **Scoring unit tests:** every type; all-or-nothing vs proportional partial credit with half-up rounding; negative
  marks only for wrong answers; skipped vs pending; fill-blank normalisation (case, spacing, Nepali digits,
  case-sensitive blanks); numeric tolerance with floating-point error; zero floor; centimark sums.
- **Schema tests:** valid content per type; answer keys must match options/pairs/blanks; unsafe rich text in options.
- **API:** create all 7 types; invalid keys/marks/topic rejected; new version only on content change; DB refuses
  UPDATE/DELETE of versions; review workflow and live-edit rule; staff scopes; text/tag/type/PYQ filters; private
  images rejected and in-use images protected (incl. course descriptions); student reports (published only, one
  open per student, resolve once, re-report after resolution).

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

### Added in Phase 6 (admin content screens)
- **Browser E2E (content team, non-Super-Admin):** permission-aware navigation; media upload of an image and a PDF
  (image re-encoded and rendered, PDF private), description saved, type filter; exam categories authority → post with
  emblem from the media picker, auto URL name, allowed child types, publish, delete refused while not empty; papers
  with marks validation, post links and status persisted; subject → chapter → topic → bilingual note (bold, image
  from the media library, Nepali tab) with required-field errors, unsaved-changes guard, reload persistence and
  publishing; video items (YouTube-for-premium warning, Bunny-not-configured error, duration validation), PDF item
  with download flag, scheduling in Nepal time shown in BS; courses (create with auto URL name, details + thumbnail
  + featured, price validation and rupee formatting, sale price, 365-day validity, subject with paper and marks
  validation, exam post and instructor links, publish, values persisted after reload, list shows price/sale/status);
  instructor profile; student course access granted with the course's validity (expiry previewed) and a note, then
  revoked with a required reason.
- **Unit (editor):** real TipTap output for every toolbar feature passes the server's rich-text allow-list after
  `toStoredDoc`; unsafe links and non-library images are dropped (mutation check: without the converter 3 tests
  fail — TipTap emits `orderedList.type` and table `align`). Duration and Nepal-time helpers.
- **API unit:** exception filter — deliberate 5xx `AppError`s log as warnings without stack; unexpected errors log as
  errors and never leak their message.
- **Unit:** multipart uploads in the API client, Button never submits a form unless `type="submit"`, slug/localised
  text/image variant/size helpers.

### Bugs caught by verification in Phase 6
- E2E: the media picker's **Choose** button submitted (and saved) the surrounding form → `Button` now defaults to
  `type="button"` (+ regression test).
- E2E: a form field named `nodeType` shadowed `HTMLFormElement.nodeType` (DOM clobbering), hiding the form from
  Playwright's text/ARIA engines → renamed to `kind`. (Chrome's own accessibility tree was unaffected — checked via CDP.)
- Screenshot review: "1 papers" → pluralised.
- Screenshot review (390 px): subject outline overflowed horizontally and squeezed item titles to nothing → badges
  wrap under the title; page-header actions wrap. Checked `scrollWidth` = viewport on outline, editor and media.
- E2E log review: an expected "Bunny not configured" 503 was logged as an unhandled error with a stack → now a
  warning.
- E2E: staff sign-in rate limit (5 per account / 15 min) hit by per-test sign-ins → content specs share one session.
- Watermark label contained a double space after stripping non-ASCII characters → whitespace collapsed.

## Not yet covered
- Staff content scopes dialog (covered by API tests, not yet by browser E2E); preview-as-student.
- Load testing (Phase 16); content, exams, payments (later phases); student mobile app (Phase 8).
