# Test Status

Last updated: 2026-10-06 (Phase 11 part 2a: plans). `pnpm test` runs unit + integration suites (needs `pnpm infra:up`);
`pnpm build && pnpm --filter @tk/admin e2e` and `pnpm build && pnpm --filter @tk/mobile e2e` run the browser suites
(the student suite also needs Mailpit, part of `pnpm infra:up`).

## Current results — all passing locally

| Package | Tests | Kind |
|---|---|---|
| `@tk/design-tokens` | 39 | WCAG contrast for every text/background pair (light + dark), CSS generation |
| `@tk/domain` | 58 | BS calendar, Kathmandu day boundary, fiscal year, money/VAT/discounts, access validity |
| `@tk/contracts` | 21 | Schema behaviour (localized text, email normalisation, mass assignment, settings defaults, rich-text validation) |
| `@tk/api` | 241 | Integration against real PostgreSQL + Redis + S3 (SeaweedFS) through the HTTP stack; TOTP RFC 6238 vectors; RBAC, video, watermark unit |
| `@tk/admin` (unit) | 35 | API client (headers, refresh single-flight, retry, session loss, error mapping), BS formatting, Button `asChild` regression |
| `@tk/admin` (E2E, Playwright) | 25 | Real browser + real API + `*_e2e` database |
| `@tk/mobile` (unit) | 36 | API client (single-flight refresh, early refresh, session end, maintenance), translations complete in both languages, BS dates and Kathmandu weekday, force-update/maintenance gate, form checks, Nepali phone numbers |
| `@tk/mobile` (E2E, Playwright, phone viewport) | 28 | Web build + real API + `*_mobile_e2e` database + Mailpit |
| **Total** | **483** | |

### Added with plans (Phase 11 part 2a, T-050)
- **API (5 integration tests):** staff write, price and publish a plan (duplicate slug 409, sale above price 400,
  audit trail, no access without `plans:manage`); students see it with pricing on Android and none on iOS; a bought
  plan opens its courses' premium content while active and not after it ends; a course the plan covers cannot be
  bought; adding / removing courses and switching to all courses apply to current subscribers at once; renewal
  starts when the current period ends (+60 days for two 30-day purchases); a lifetime plan cannot be rebought; a
  free plan is not sold; "plans only" Premium tests open to plan holders.
- **Admin E2E (1):** create a plan, add a feature, highlight, price, choose a course, publish; list shows it.
- **Student E2E (1):** Profile → Subscription plan → plan card (Recommended, features, course, sale price) → checkout
  → Khalti → paid → the covered course is open → "Your plan · until …" → Renew shows the renewal note → Purchases.
- KI-036 seen once (Vitest worker exit 0xC0000409 in `content-admin`); the re-run passed 241/241.

### Added with the Android payment return fix (KI-042)
- **API unit (3):** development callback address = the address the device reached the API on (emulator 10.0.2.2,
  phone on Wi-Fi), never a malformed one; any other environment always uses the configured address; the app's return
  link is accepted only when allowed (configured, or Expo Go's in development) — never an arbitrary address. Payment
  integration tests and the purchase / orders browser specs re-run green.

### Added with the free-enrolment access fix (D-053, KI-043)
- **API (1 new + 1 updated integration test):** a free course sharing a subject with a paid course no longer unlocks
  the paid course's premium lessons or PDF (mutation-checked: the old rule fails both tests); a free enrolment opens
  free lessons only; a staff grant (or purchase) unlocks premium ones. All suites re-run green.

### Added with course purchase (Phase 11 part 1, T-049)
- **Gateway unit (5):** eSewa form signing (field order, rupee amounts), eSewa's **own published signed success
  response** accepted and altered / unsigned / garbage ones rejected, status-check mapping (COMPLETE, NOT_FOUND,
  PENDING, AMBIGUOUS, CANCELED, FULL_REFUND, outage); Khalti initiate (paisa, server key, return address) and lookup
  mapping (only Completed completes).
- **API (8 integration tests, gateways answered by a test stand-in at the HTTP boundary):** Playbook §11.11 —
  success (Khalti, eSewa), failure / cancellation / expiry (no access, try again), **duplicate and repeated
  callbacks** (one access, events kept), **invalid signature** (rejected), **invalid amount** (no access, flagged —
  mutation-checked), **expired payment** and unpaid orders (worker), **client disconnect after payment** (order view
  and worker settle it), **duplicate enrollment** (two payments → one access, second flagged — mutation-checked;
  D-052 refuses rebuying); also: price from the server only (client amounts ignored), channels (iOS, Android
  web-only), free courses, gateway switched off, gateway down (502, recorded), forged return addresses, privacy of
  orders, staff permissions, staff re-check (audited), revoking paid access keeps the order.
- **Real test gateways (manual script, session 20):** eSewa accepted our signed form and rejected a bad signature;
  eSewa status API and Khalti initiate / lookup answered through our gateway code. Completing a payment on their own
  pages is a manual owner check (KI-041).
- **Browser E2E (student app, 1 new spec / 2 tests; local gateway stand-in):** Buy → checkout (Rs 1,500, both
  gateways) → Khalti → cancel → "Payment not completed" → Try again → eSewa (our signed hand-off page) → pay →
  "Payment successful" → access → Purchases lists it. **CMS (1):** a student paid and never came back → Orders →
  "Check with Khalti" → paid, access given, gateway messages shown.

### Added with exam hardening (§10, T-048)
- **API (3 integration tests):** a save that arrives after a newer one is skipped (mutation-checked), newer saves and
  clearing still apply, older apps without `clientSavedAt` always apply; four submits and a save arriving together
  score once and the stored answer is the scored one, closed afterwards, nothing left for the worker; a submit after
  the time is up counts at the deadline with the answers saved in time; a new start after a finished attempt makes a
  new attempt. (Simultaneous starts, repeated submits, grace and the worker were already covered.)
- **Browser E2E (student app, 1 new):** answer online → connection drops → answer offline ("Offline — your answers
  are kept on this phone") → close the app → reopen online → "Continue test" → answers sent → score 2 of 2. It failed
  before the KI-039 fix.
- **CMS:** the certificates spec failed in CI (KI-040): revoking while a search was still loading left the list on
  the old state. The spec now delivers that search response late on purpose, so the race happens every run; it fails
  without the fix and passes with it.

### Added with the mistake notebook (§10 part 3c)
- **Domain (unit, 5):** practice feedback (correct / partial / wrong / skipped, written answers self-reviewed); what
  counts as a mistake (D-050); first mistake → N correct in a row masters it, a wrong one resets the run, N = 1; a
  mastered or removed question returns on a new mistake with its history; a mistake older than the latest revision
  only counts in the history.
- **API (5 integration tests):** practice answers scored on the server (wrong and partial kept, correct and
  unanswered not; written answers and mismatched types refused); notebook list and summary; revision to mastery with
  the CMS N (2, then 1), reset on a wrong answer, partial is not correct, 404 once mastered or never answered,
  removal, return with history; test mistakes **only after results are released** (mutation-checked), never skipped
  answers, not twice, history across tests; premium answers locked without access unless a released test showed the
  solution (mutation-checked); self-graded written answers join once completed and are self-reviewed; sign-in
  required; bad cursor refused; erasure removes the notebook.
- **Browser E2E (student app, 2 new):** wrong practice answers → "Saved to your mistake notebook."; Profile →
  Mistake notebook → 2 to revise → correct twice in a row → mastered → remove the other → 0 to revise · 1 mastered.
- **Screenshots reviewed** (notebook, revision answer, mastered, practice note, Nepali dark). Fixed "1 marks" on
  practice questions.

### Added with certificates (§10 part 3b)
- **Domain (unit, 4):** certificate earned at exactly the share (66.7 % vs 66 / 67 %, empty course never); 8 bytes →
  12 unambiguous characters; printed in groups of four; read back ignoring case, spaces, dashes and O/0, I/L/1.
- **API PDF (unit, 2):** one A4 landscape page in English and Nepali, with and without the QR code; no signatories /
  no intro. Rendered PDFs checked visually (Devanagari conjuncts, reph and vowel signs shape correctly).
- **API (4 integration tests):** issued automatically at the template share, once; frozen wording and name after
  template / name edits; public verification however the number is typed; PDF served; unknown numbers 404; no
  certificate without course access (mutation-checked on the course page), inactive template or no template; lessons
  finished earlier count once access / the template arrives; revoke (reason required, 409 twice) → verifies as
  revoked, PDF 410 (mutation-checked), not issued again → reinstate; audit trail; template validation; course editors
  pick templates but cannot write them; staff scopes on the issued list, revoking and assigning; sample PDF;
  verification URL setting; erasure removes certificates. Existing catalog / progress checks updated for the new
  fields.
- **API (1 integration test):** the default per-IP limit (300 a minute, `RATE_LIMIT_DEFAULT_PER_MINUTE`, KI-038):
  the 301st request is refused, another IP is not.
- **Browser E2E (CMS, 2 new):** write a template (validation), sample PDF download, choose it on the course's
  Certificate tab; a student finishing the course receives it; search by number, revoke with a reason, reinstate.
- **Browser E2E (student app, 2 new):** enrol → course page shows the rule and 0 of 2 lessons → finishing a lesson
  shows "Certificate earned!" → Certificates lists it → Open certificate requests the PDF; course page and Profile
  lead to it.
- **E2E harness:** a second seeded editor account and a reused editor token keep the suites under the staff sign-in
  limit; E2E runs raise the default per-IP limit (all traffic comes from 127.0.0.1).
- **Screenshots reviewed** (CMS template, course tab, revoke dialog, issued list; app course page, dialog, list, Nepali
  dark). Fixed: number and date wrapping in the CMS list; the course hero back arrow in dark mode; Nepali wording.

### Added with daily challenge, streaks and leaderboards (§10 part 3a)
- **Domain (unit):** streak advance (same day, next day, gap, older day, month/year boundary), streak shown as 0 after
  a missed day, leaderboard names (first + initial, Devanagari, single name, full, none), competition ranking.
- **API (4 integration tests):** today's challenge; streak 4 → 5; same day again unchanged; past challenge is
  practice and never extends a streak (mutation-checked); future challenge not open; practice off → closed; lapsed
  streak shows 0; erasure removes the streak; ranks from official attempts with ties (1, 2, 2, 4), names per
  setting (first + initial / full / none), rank on the result, hidden before release, practice excluded, 404 without
  a leaderboard. Existing attempt / grading / builder suites still pass.
- **App unit:** Nepal day at midnight boundary; route gate (no decision before the account loads — KI-037).
- **Browser E2E (student app, 2 new):** Home card → today's challenge → Rank 1 of 1 → leaderboard → 1-day streak and
  "Done for today"; past challenge → practice note → no rank, streak unchanged. KI-037 reproduction: 2/5 failures
  before the fix, 8/8 passes after (16 reloads).
- **Screenshots reviewed** (light, Nepali dark): Home card before/after, exam counter, result rank, leaderboard.
  Fixed: "1 questions", the 5-minute warning shown for the whole of a 5-minute test.

### Added with grading and results (§10 part 2)
- **API (4 integration tests):** queue → grade (over the maximum refused) → corrected → totals and pass/fail → hidden
  until released → release needs `assessments:publish` → student sees score and comment; releasing twice changes
  nothing; audit entries; auto-scored, unanswered and running attempts cannot be graded; permissions and staff
  scopes (mutation-checked: removing the attempt scope check fails the test); statistics from official attempts.
- **Regression:** a scoped editor searching assessments sees only their scope (fails without the KI-035 fix).
- **Browser E2E (admin):** Grading → invalid marks message → marks + comment → queue empty → Results (Completed,
  4 / 5) → Release results → student result released with the comment → attempt page shows who marked it.
- **Browser E2E (student app):** a written answer in an instructor-graded test → "teachers will mark" → graded via
  the CMS API → 4/5 and "Comment from your teacher" in the review.
- **Screenshots reviewed:** Grading, Results, attempt page.

### Added with the attempt engine (§10 part 1)
- **API (10 integration tests):** start → autosave (newest wins) → resume → submit with negative marking and partial
  credit (exact score); no answer key, explanation or model answer in the running attempt (rule 5); wrong answer
  types and foreign questions refused; double submit harmless; saves after submit refused; five simultaneous starts
  create one attempt; grace period accepts a late save, later saves submit automatically with the deadline as the
  submit time; the worker finishes abandoned attempts; window not open / closed, late-start rule both ways, attempt
  limit; Premium access rule (course, category, parent category, subject, any course, plans only); results hidden
  until after close / manual release; written answers self-graded (marks capped) → pass/fail; official attempt
  first/best; random sections pick distinct questions; an edit after start does not change the attempt (version
  pinned); other students get 404; verification required; erasure removes attempts. **Mutation-checked:** sending
  answers during the attempt, opening Premium to all, or never expiring each makes tests fail.
- **Domain (unit):** window state, deadline with late start (all four cases), result release, official attempt.
- **Browser E2E (student app, 3 new):** subject Tests tab → rules → exam: answer, mark for review, **reload resumes
  every answer**, palette states, confirm counts, submit → 1.5/5 (−0.5 + 1 + 1) and Passed → review with explanation
  → attempt listed; weekly exam from "Tests for your exam" waits for its window to close; a 1-minute test is
  **submitted by the app when time runs out**. Practice questions still pass after sharing their answer inputs.
- **Browser E2E (admin):** changing "Official attempt" in Settings → Assessment defaults prefills new assessments.
- **Screenshots reviewed** (light, dark, Nepali): tests tab, test page, exam, palette, submit, result, review, waiting
  result, CMS editor and settings. Fixed: "1 marks" (now "Marks 1"), "5 minutes left" shown for the whole last five
  minutes (now "Less than 5 minutes left"), truncated option labels in the settings card.

### Added with Sentry in the app and admin (T-042)
- **Browser E2E (admin + app):** the test servers use a fake Sentry host; a real uncaught error reaches it tagged
  with the service, and the email in the query string, typed email and password, and console output are absent.
  Mutation-checked: without the scrubber and breadcrumb blocking, both tests fail (the query-string email leaks).
- **Unit:** admin and app scrubbers keep only the page path (and device context in the app); admin monitoring is off
  without a DSN.
- **Google (manual):** Google accepts the owner's new web client with `http://localhost:8081` (sign-in page shown)
  and refuses an unregistered address.

### Added with monitoring and analytics (T-042)
- **API (Sentry):** a local stand-in for Sentry receives the real SDK's envelopes. Unexpected errors arrive with the
  request id, route pattern, job name and environment; deliberate `AppError`s and 4xx do not; the password, bearer
  token, cookie, query string and email of the failing request are absent. Scrubber unit test; nothing is sent
  without a DSN. Analytics pseudonym: stable, different per account, contains no id, email or name.
- **App unit:** screen names by route pattern; analytics scrubber drops URLs, referrers and person properties.
- **Browser E2E:** the test build sends analytics to a fake host, intercepted: `logged_in`, `$identify` with the API's
  pseudonym, `$screen` names (`/login`, `/onboarding`, `/`, `/search`), `search_performed` with a count only; no
  name, email, account id, search text, password or URL properties anywhere in the payload (the URL check failed
  before the scrubber was added). The real PostHog key and Google client id are absent from the test build.
- **Manual:** a test error was sent to the real Sentry project with `cli monitoring-test` (owner to confirm it
  arrived — the provided token cannot read issues). Google sign-in: the button appears with the web client id;
  Google answers `redirect_uri_mismatch` for an unregistered address (the app returns to its own origin).

### Added with student learning, part 2 (Phase 9)
- **API:** practice questions — free answers sent, locked premium answers absent from the whole response (checked
  for the model-answer text; forcing answers into locked questions makes 2 tests fail), unlocked after access is
  granted, paging and chapter / topic filters, subject outside the course and drafts → 404, verification required;
  bookmarks (save twice, remove, unpublished hidden, erased with the account); search (courses, lessons, questions;
  premium bodies and model answers absent, drafts excluded, 1-letter query refused); `splitQuestion` for all 7 types (unit).
- **App unit:** practice feedback (single / multiple / match / blank / numeric / written), numbered blanks, BS ↔ AD
  date of birth.
- **Browser E2E (student app):** subject → Questions → wrong answer → explanation → Try again → correct; Premium
  answer locked and absent from every `/questions` response; report a question; save; search finds the lesson and
  the question; Saved lists it; edit profile (name, gender) shows on Profile; delete account → scheduled BS date →
  Keep my account.
- **Screenshots reviewed** (light, dark, Nepali): practice, report sheet, search, Saved, edit profile, password,
  devices, deletion. Fixed: browser focus ring drawn over the design's focus border on web inputs.

### Added with the YouTube fix
- Reproduced error 153 without a Referer and normal playback with one, in Chromium and on the Android emulator
  (WebView). Browser E2E now checks the YouTube iframe's referrer policy; unit tests cover the emulator API address.

### Added with student learning, part 1 (Phase 9)
- **API:** progress positions and permanent completion (mutation-checked), same access rules as opening the item
  (locked premium refused), invalid inputs and wrong course refused, outline progress, Continue (latest unfinished,
  course context, skips unpublished items), finished / total per course; PDF reader page CSP, framing and file
  allow-list (path traversal and unlisted files → 404).
- **Browser E2E (student app):** catalog for my exam with prices, paid course shows price and no Enrol, free course
  Enrol → access; outline → note (heading, bold, list) → Mark as finished → Next lesson → PDF rendered by pdf.js in
  the reader (3 pages, page indicator, watermark notice) → outline shows Done; video embed URL; Home current course
  33 % and Continue reopens the PDF.
- **Screenshots reviewed** (light, dark, Nepali). Fixed: PDF not recorded as started until scrolled (Continue missing),
  Nepali prices with Latin digits in Chromium (`formatNpr` now converts digits itself), missing chapter chevron,
  oval back button on the course page.

### Added with the student app foundation (Phase 8)
- **API:** `/me/target-posts` (order, path, replace, empty), refused unpublished/unknown/duplicate/too many, hidden
  once an ancestor is unpublished, students only; `childCount` in the public category list; erasure clears target
  posts (mutation-checked); `app.storeLinks` https-only and published in `/app/config`.
- **App unit:** single-flight refresh mutation-checked (3 refreshes without it).
- **Browser E2E:** sign-up validation → email code (wrong code refused, real code from Mailpit) → onboarding with
  CMS categories (search, choose) → Home with today's BS date; Nepali + dark applied and kept after reload; log out,
  wrong password refused, log in; forgot password → code → new password → log in.
- **Screenshots reviewed** (light, dark, Nepali, tablet). Defects found and fixed: verify skipped after sign-up and
  “Continue” stuck after verifying (navigation raced the route guards), stretched category chip row, clipped tab
  labels (Nepali vowel signs cut off), header not centred on tablets.

### Added with the assessment builder
- **API:** fixed + random sections; readiness problems (no sections, unpublished question, pool too small) and
  exact totals with per-question and section marks; publish refused until ready (mutation-checked); question in a
  live assessment cannot be deleted; mixed-marks warning and min/max totals; written answers need a grading mode;
  pass marks above total; window / after-close / daily-challenge validation; one daily challenge per day (409);
  chapter must belong to the subject; broken structures rejected; review workflow; staff scopes; audit; defaults
  endpoint.
- **Browser E2E:** quiz with unchosen scoring refused, created, publish refused while not ready, questions added with
  the picker and a marks override, random section shortage reported then removed, ready (2 questions · 5 marks),
  published, list row.
- Note: one full local run printed `145 passed (151)` with no failure listed; two forced re-runs and CI passed 151/151.

### Added with the Excel import
- **API:** the template's 8 example rows (all 7 types + passage) preview clean and import as drafts with topic, PYQ
  stage, paper, tags and passage resolved; nothing saved before confirm; confirm twice refused; re-upload warns about
  duplicates; 8 kinds of row problems reported with the exact column (duplicate ref, unknown subject / category /
  paper / chapter / passage, disabled type, bad answer); only ready rows imported; unreadable file and missing sheet
  refused; only the uploader can confirm; a topic deleted after preview blocks the confirm (mutation-checked);
  scoped editors only match their subjects; permission required.
- **Browser E2E:** download the template from the app, fill it with ExcelJS, upload, see the problem row and the
  ready row, filter, import, find the draft in the Question bank.

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
