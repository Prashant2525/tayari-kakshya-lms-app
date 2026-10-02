# Dynamic Admin Audit

Audit date: 2026-10-03 · Branch `feature/question-bank` · Requirement: the Admin CMS is the central control system;
adding or changing business/content data never needs a code change (owner, 2026-10-03). Security-critical logic stays
in code (see §3).

Method: read `DECISIONS.md`, `DATABASE_ARCHITECTURE.md`, `FEATURE_SPECIFICATION.md`, and inspected the code —
the Prisma schema (36 models, 25 enums), the `SETTINGS` registry, every API controller, and every admin page.

Legend:
- **Dynamic?**: ✅ managed in the CMS today · ◐ partly · ❌ not yet · — not built yet.
- **Hard-coded?**: what is fixed in code today.
- **Status**: ✅ done · 🔧 changed in this audit · 📅 planned (phase) · 🔒 intentionally code-controlled.

## 1. Summary

1. **Already dynamic.** All content and catalog data built so far is database-driven and edited in the CMS:
   - taxonomy nodes, papers;
   - subjects → chapters → topics → notes / PDFs / videos;
   - courses, prices, sales, validity;
   - instructors, media, staff scopes, course access;
   - questions, tags, passages, reports;
   - roles, education levels;
   - typed system settings.

   Content goes through publish / schedule / archive, soft delete / restore and reorder. Nothing in the API returns
   hard-coded academic or commercial content (rule 7 has been followed).
2. **Hard-coded today that should be CMS-managed:**
   - **Exam category types** are a fixed database enum (`authority / level / service / group / post`) with code-fixed
     ranks. Papers can only attach to `post` nodes. Admins therefore cannot add **sub-groups** or **exam stages**.
     This was the one architectural blocker, and it is 🔧 fixed in this audit (§4.1).
   - **Enabled question types** (D-016 promised admin enable/disable). 🔧 Added as a setting (§4.2).
   - **Email/SMS message wording** (OTP, invitations) is in code. 📅 Phase 12, with notification templates (planned
     table `notification_templates`).
3. **Correctly code-controlled:** authentication, authorization, permission catalog, token signing, payment
   verification, encryption, scoring algorithms, workflow states, rate limits, infrastructure (§3).
4. **Not built yet, but designed to be dynamic** (tables already planned in `DATABASE_ARCHITECTURE.md` §2.6–2.9):
   - assessments / schedules;
   - current affairs, Gorkhapatra, news / blog;
   - notices, notifications, banners / CTAs, home sections;
   - plans, coupons, orders, invoices;
   - FAQs, static pages, contact options, certificates.

   Each will ship with CMS screens (CRUD, publish/schedule, order, activate) when its phase starts.
5. **Mobile app:** not started (Phase 8). It **must** render only server data. Rules for it are recorded as D-045
   (§5), so it is built dynamic from day one.
6. **Schema / API / CMS compatibility:**
   - PostgreSQL schema: yes, after the node-type change. Every business entity is a table with status, sort order
     and soft delete.
   - API: yes. Admin CRUD plus public read endpoints, with server-side authorization.
   - CMS: yes, with patterns that are reused for every new module.

   No existing decision blocks the requirement. D-007 / D-010 already said "taxonomy fully admin-managed"; the enum was
   an implementation shortcut, now corrected.

## 2. Inventory

### 2.1 Catalog, taxonomy and content

| Feature / data | Dynamic? | Hard-coded? | Should be admin-managed? | Required changes | Status |
|---|---|---|---|---|---|
| Exam authorities, levels, services, groups, posts (nodes) | ✅ | — | Yes | — | ✅ |
| **Category types** (authority, level, service, group, **sub-group**, post, **exam stage**…) | ❌ | Fixed enum + ranks in code; papers only on `post` | Yes | `exam_node_types` table (name, rank, root/papers flags, active); API + CMS page; node type becomes a FK | 🔧 |
| Exam stages (e.g. Preliminary, Main, Interview) | ❌ | Not representable | Yes | A category type with `canHavePapers`; papers attach to stage nodes | 🔧 |
| Sub-groups | ❌ | Not representable | Yes | A category type | 🔧 |
| Papers (marks, time, pattern, linked posts) | ✅ | — | Yes | Link to any type that allows papers | 🔧 |
| Syllabus | ◐ | — (paper pattern text only) | Yes | Rich syllabus + PDF on papers / categories | 📅 Phase 7 (after assessments) |
| Subjects, chapters, topics | ✅ | — | Yes | — | ✅ |
| Lessons: notes, PDFs, videos | ✅ | — | Yes | — | ✅ |
| Content languages (en / ne / both) | — | Enum | No: app languages are a product decision (D-008) | — | 🔒 |
| Publish workflow states | — | Enum | No: workflow semantics | — | 🔒 |
| Courses: details, subjects, links, featured, popularity rank | ✅ | — | Yes | — | ✅ |
| Course pricing, sale window, validity | ✅ | Validity *kinds* (days / date / lifetime) are code | Values yes; kinds no | — | ✅ |
| Free-course enrolment (D-043) | ✅ (price 0 is CMS) | Rule in code | Rule decided by owner | — | ✅ |
| Instructors | ✅ | — | Yes | — | ✅ |
| Media library | ✅ | Size limits in env (ops) | Limits: ops config | — | ✅ |
| Video hosting (Bunny / YouTube per item) | ✅ | Provider credentials in env | Credentials no (secrets) | — | 🔒 |

### 2.2 Questions and assessments

| Feature / data | Dynamic? | Hard-coded? | Should be admin-managed? | Required changes | Status |
|---|---|---|---|---|---|
| Questions, answers, explanations, model answers | ✅ | — | Yes | — | ✅ |
| Question tags, passages, PYQ sources | ✅ | — | Yes | PYQ source can point at exam-stage nodes after §4.1 | ✅ / 🔧 |
| **Question types** (enable / disable, labels) | ❌ | All 7 engines always on | Enable/disable + display names yes; new *engines* need code (D-016) | Setting `questions.types` (enabled list + optional labels); API rejects disabled types for new questions | 🔧 |
| Difficulty levels | — | Enum (easy / medium / hard) | No: used by blueprints and analytics | Labels translated in apps | 🔒 |
| Question report reasons | — | Enum | Low value; keep fixed | — | 🔒 |
| Bulk question import / export | ❌ | — | Yes | Excel template + import with validation preview; export | 📅 Phase 7 (next) |
| Quizzes, weekly, mock, PYQ mock, daily challenge | — | — | Yes | Assessment tables, builder, rules per D-021 / D-044 | 📅 Phase 7 |
| Exam schedules (windows, publish times) | — | — | Yes | Assessment `opens_at` / `closes_at`; notices | 📅 Phase 7 / 12 |
| Scoring rules (partial credit, negative marks, floor) | — | Algorithms in code | Choices yes (D-044); algorithms no | Per-assessment fields + defaults setting | 📅 Phase 7 |
| Leaderboards, certificates, streaks | — | — | Rules yes | Planned tables | 📅 Phase 10 |

### 2.3 Communication and home screen

| Feature / data | Dynamic? | Hard-coded? | Should be admin-managed? | Required changes | Status |
|---|---|---|---|---|---|
| Current affairs, news, blog, Gorkhapatra summaries | — | — | Yes | `articles` (planned) + CMS | 📅 Phase 12 |
| Notices, announcements, instructor messages | — | — | Yes | `notices` (planned) | 📅 Phase 12 |
| Notifications (campaigns, templates) | — | OTP email/SMS wording in code (`otp-messages.ts`) | Yes (wording, campaigns) | `notification_templates` with code defaults | 📅 Phase 12 |
| Banners, CTAs | — | — | Yes | `banners` (planned) | 📅 Phase 12 |
| Home-page / app sections, featured / popular | ◐ | — | Yes | `home_sections` (planned); courses already have featured / popularity | 📅 Phase 12 |
| FAQs, static pages (terms / privacy / refund), support / contact | — | — | Yes | `faqs`, `static_pages`, `contact_options` (planned) | 📅 Phase 12 / 15 |

### 2.4 Commerce

| Feature / data | Dynamic? | Hard-coded? | Should be admin-managed? | Required changes | Status |
|---|---|---|---|---|---|
| Subscription plans | — | — | Yes | `plans` (planned) | 📅 Phase 11 |
| Coupons, promotions, sales | ◐ | — | Yes | `coupons` (planned); course sale prices exist | 📅 Phase 11 |
| Orders, refunds, invoices | — | — | Viewed / acted on in CMS; never edited freely (rule 8) | Planned | 📅 Phase 11 / 13 |
| Purchase channels per platform (D-027) | ✅ | — | Yes | — | ✅ |
| VAT rate, PAN, invoice prefix | — | — | Yes | Settings (planned) | 📅 Phase 11 |
| Payment gateway enable / disable | — | — | Yes (on / off per gateway) | Setting with the gateway work | 📅 Phase 11 |
| Payment credentials, verification logic | — | Env + code | **No** (secrets / security) | — | 🔒 |

### 2.5 People, access and system

| Feature / data | Dynamic? | Hard-coded? | Should be admin-managed? | Required changes | Status |
|---|---|---|---|---|---|
| Students (search, suspend, sessions, device limit override) | ✅ | — | Yes | — | ✅ |
| Staff, roles, role permissions, staff scopes | ✅ | — | Yes | — | ✅ |
| Permission catalog | — | Code (`permissions.ts`) | **No**: each permission is enforced in code | Roles bundle them in the CMS | 🔒 |
| Access rules: free / premium per item, course entitlements | ✅ | — | Yes | — | ✅ |
| Education levels | ✅ | — | Yes | — | ✅ |
| System settings: device limit, verification channels, staff 2FA, deletion grace, maintenance, minimum app versions | ✅ | — | Yes | — | ✅ |
| Audit log | ✅ (read) | — | Read-only (rule 8) | — | ✅ |
| Rate limits, OTP lifetime, password rules, token lifetimes | — | Code / env | **No** (security) | — | 🔒 |
| Signed video link lifetime | — | Env (`VIDEO_PLAYBACK_TTL_SECONDS`) | No (security); default shortened to 5 min | — | 🔒 |
| App UI wording (buttons, menus) | — | App i18n bundles (en / ne) | No: shipped with the app (Expo OTA updates) | Content stays server-side | 🔒 |

### 2.6 Clients

| Area | Dynamic? | Notes | Status |
|---|---|---|---|
| Admin CMS | ✅ | Lists and options come from the API, except the code-controlled enums above. Category-type labels move to the API with §4.1. | 🔧 |
| Mobile app | — | Not built (Phase 8). Must follow D-045. | 📅 Phase 8 |
| Public website | — | Not built (Phase 11). Same rule as the app. | 📅 |

## 3. Intentionally code-controlled (and why)

- **Authentication, sessions, tokens, 2FA, OTP, encryption, rate limits.** Security; a mistake in the CMS must not be
  able to weaken them.
- **Permission catalog.** Each permission is checked by code. Admins create roles from the catalog; new permissions
  arrive with new features.
- **Payment verification, idempotency, financial records.** Rule 6 / rule 8. Gateway credentials are secrets.
- **Algorithms:** scoring engines, BS calendar, VAT maths, publishing rules. The *choices* that feed them are CMS data
  (D-044).
- **Engines for question types and assessment types.** Admins enable, disable and label them; a new *kind* of question
  needs new rendering and scoring code (D-016).
- **Enums with behaviour:** publish status, access level, validity kind, media kind, entitlement source / status,
  attempt status. They drive code paths; their labels are translated in the apps.

## 4. Changes made in this audit

### 4.1 Configurable exam category types (non-destructive migration)

- New table `exam_node_types`:
  - `key` (stable slug);
  - `name` (en / ne);
  - `rank` (a child must rank lower in the hierarchy than its parent);
  - `can_be_root`;
  - `can_have_papers`;
  - `active`;
  - `sort_order`.
- Seeded with the existing five types at their existing order. Also seeded with **Sub-group** (between group and post)
  and **Exam stage** (below post, can have papers). Admins can rename, re-rank, deactivate or add types.
- `exam_nodes.node_type` changes from the enum to text with a foreign key to `exam_node_types.key`. **Existing rows
  keep their values** (`ALTER … USING node_type::text`). The old enum is dropped only after the conversion.
- API: `nodeType` stays a string in all requests and responses, so admin and test clients keep working. Hierarchy and
  paper rules read the table instead of constants. New endpoints under `/admin/exam-node-types`. The public
  `GET /exam-node-types` lets the app label levels.
- CMS: new "Category types" page; category and paper screens read type names from the API.

### 4.2 Question types enabled / disabled (D-016)

- Setting `questions.types`: the list of enabled types plus optional display names. Default: all seven enabled, no
  label overrides.
- The API refuses *new* questions of a disabled type. Existing questions keep working.
- The CMS "New question" menu shows only enabled types, with the configured names.

### 4.3 Video links

Signed embed links now last 5 minutes by default instead of 4 hours. This was verified safe: Bunny's player signs the
CDN segment URLs itself for about 10 hours after loading.

## 5. Rules for everything built from now on (D-045)

1. Every new business entity gets:
   - a table, with status / publish fields where content is published;
   - `sort_order` where the order matters;
   - soft delete;
   - audit entries;
   - admin CRUD with publish / schedule / reorder / activate as applicable;
   - a read API for clients.
2. Lists of choices that have no code behaviour are **tables or settings**, not enums.
3. The mobile app and the website contain **no academic, commercial or marketing content**. They render:
   - `/app/config`;
   - home sections, banners and notices;
   - the catalog and content APIs.

   Navigation to categories, courses, quizzes, articles and banners is driven by IDs and slugs from the API. App
   wording lives in i18n bundles.
4. Business values never default to invented numbers. Unset values block go-live via the launch checklist.
5. Bulk operations and CSV/XLSX export are added to list screens as each module lands (questions first).
