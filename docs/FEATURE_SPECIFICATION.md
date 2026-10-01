# Feature Specification (Draft v0.1)

Status: **DRAFT — pending owner answers** (`OPEN_QUESTIONS.md`). Each item is tagged with its origin:

- **[PDF]** derived from the UI reference (see `PDF_UI_FEATURE_EXTRACTION.md`, page in brackets)
- **[USER]** explicit requirement from the owner's master prompt / Playbook
- **[REC]** recommended by me — **not in scope until approved** (`SUGGESTED_FEATURES.md`)
- **[TECH]** technical implementation default (no product impact; can be changed)

Business values (prices, durations, marks, negative-marking rates, limits) are **never** hard-coded: they are CMS/DB data.

---

## 1. Surfaces

| Surface | Users | Origin |
|---|---|---|
| Student mobile app (React Native) | Students | [USER] |
| Admin CMS (web) | Staff by role | [USER] |
| Backend API + PostgreSQL + jobs | — | [USER] |
| Public website / student web app | — | [REC] pending Q5 |

## 2. Student app

### 2.1 Authentication & account
- Sign up (name, email, password) [PDF p1] · Login [PDF p2] · Google sign-in [PDF p1–2; USER "if approved" → shown in PDF, confirm Q28]
- Forgot / reset password + success screen [PDF p3–5] (link vs OTP: Q29)
- Logout [PDF p24] · Change password [PDF p24]
- Email/phone verification [USER, if approved — Q28]
- Secure token storage, session restore, device/session management [USER]
- Account deletion [USER Playbook; store requirement — Q31]

### 2.2 Home
- Greeting + avatar, notification bell with unread badge [PDF p6]
- Global search [PDF p6, p29] (courses / questions / content; scope Q7)
- Categories row + "See all" grid with search [PDF p6, p7, p44]
- Popular courses with filter chips + "See all" list [PDF p6, p8]
- Course-context home for enrolled learners: course shortcuts + subjects [PDF p29]
- CMS-driven promotional banners/carousel [PDF p33; USER]
- Continue learning, daily challenge, upcoming exams, notices, progress snapshot [USER Playbook — subject to approval of related modules]

### 2.3 Catalog & course
- Category → Post/sub-category → Course browsing [PDF p7, p44]
- Course card: thumbnail, title, short description, price, rating [PDF p6, p8, p37]
- **Course detail / purchase page** (syllabus, what you'll learn, instructor, lesson counts, duration, validity, price/sale price, CTA) [USER Playbook; **not in PDF — new design**]
- Course dashboard: Gorkhapatra / Weekly Exam / Current Affairs shortcuts + Subjects with F.M./P.M./duration [PDF p9, p40]
- My learning / enrolled courses [PDF p24 "Enrolled course"; USER]
- Ratings & reviews [PDF shows rating; system needs approval — Q34]

### 2.4 Learning (Subject → Chapter → Topic)
- Subject screen with tabs Notes · Videos · Questions · Quizzes [PDF p10–18]
- Chapter accordions with numbered topics, descriptions, durations [PDF p10, p11, p47]
- Notes / PDF viewer with page navigation and resume [PDF p12]
- Video lists with counts/durations, nested multi-video topics [PDF p13, p14, p46]
- Video player: seek, ±10s, prev/next, volume, fullscreen, overflow (speed/quality), resume, progress tracking [PDF p15; USER]
- Captions/transcripts where available [USER Playbook]; offline downloads [REC, Q10/Q11]
- Free vs premium gating per content item, server-enforced [PDF p16–17, p23; USER]

### 2.5 Questions & practice
- Chapter-wise subjective questions with marks + model answer, locked/unlocked [PDF p16, p17, p45]
- MCQ quizzes per chapter [PDF p18]
- Additional question types [USER Playbook list — confirm Q12]
- Explanations, sources, bookmarks, report question [USER Playbook]
- Previous-year questions [PDF p23 "Old Questions"; USER]

### 2.6 Assessments
- Weekly exams [PDF p9, p19, p20, p36] — rules Q17
- Chapter/topic quizzes [PDF p18], subject tests, full mock tests, previous-year mock mode, daily challenge [USER Playbook — confirm Q18/Q19]
- Exam engine: instructions, server-authoritative timer, question palette, mark for review, autosave, resume after disconnect, submit confirmation, auto-submit, server scoring incl. negative marking, results, solutions, attempt history [USER]

### 2.7 Current affairs, news, notices, notifications
- Gorkhapatra section [PDF p9, p21, p32] — content & rights Q14
- Current affairs [PDF p9, p22] (daily/weekly/monthly/yearly, categories, quiz — Q14)
- News/articles, blog [PDF p24 "Blog"; USER]
- Notices tab [PDF p28] — meaning Q15
- Notifications list [PDF p27] + push + preferences [USER]

### 2.8 Commerce
- Plans: Free / Premium [PDF p23]; per-course purchase [PDF p6 price] — model Q20–22
- Checkout with eSewa, Khalti, ConnectIPS [USER; PDF p36 shows "khalti", VISA, bank icons]
- Payment states: pending, success, failed, cancelled, expired, refunded, reconciled [USER]
- Receipts/invoices [USER Playbook — tax rules Q24]; coupons/discounts [PDF p33 — Q23]
- Subscription status + expiry [PDF p24 "Subscription plan"; USER]

### 2.9 Progress & personalisation [USER — scope to confirm in Q34]
- Overall/course/subject/topic progress, study time, score history, accuracy, weak/strong areas
- Bookmarks [PDF p36 icon; USER], mistake notebook, revision, study plan

### 2.10 Profile & support
- Profile view (avatar, name, enrolled course/status) [PDF p24–25]
- Edit profile: avatar, full name, DOB, email, phone (+977), gender, "Student" field [PDF p26 — Q30]
- Settings: notification preferences, language [REC/Q4], theme (light/dark) [REC]
- About, Terms, Privacy [PDF p24], Refund policy, FAQ/Help, Support tickets [USER Playbook — Q33/Q37]

## 3. Proposed academic & content model (for approval — Q6)

Two separate trees connected by many-to-many links:

```
EXAM TAXONOMY (configurable; levels optional per authority)
Authority/Organisation ─┬─ Level/Examination ── Service ── Group ── Post
  e.g. Lok Sewa Aayog    │  e.g. "Nayab Subba"   "Administration" "General Admin" "Nayab Subba (Admin)"
  e.g. Nepal Police      └─ (Post directly)      e.g. "Prahari Jawan", "Sainey Likhit"?  ← verify
                                         │
                                  Post ──< Paper (official exam paper: full marks, pass marks, duration, question pattern)

CONTENT TREE (reusable)
Subject ── Chapter ── Topic ──< Content item (Note | PDF | Video | Question | Quiz)
   ▲
   └── Paper ⟷ Subject (many-to-many; a paper covers one or more subjects; a subject can serve many papers)

COMMERCE
Course ── links to ≥1 Post / Paper ── includes Subjects (ordered) ── price, validity, access level
Plan   ── grants entitlements to a set of Courses / content tiers / exam types
```

Why: Lok Sewa, provincial PSCs and security forces have *different* hierarchy depths; a typed, optional-level taxonomy
avoids schema changes when a new authority is added, while the content tree stays strict for clean navigation and progress.
Question bank items are tagged to Topic plus taxonomy metadata (authority/post/paper/year/source) so the same question can
appear in practice, quizzes, mocks and previous-year sets.

## 4. Admin CMS (all modules [USER])

Dashboard & analytics · Users · Roles & permissions · Categories · Exam taxonomy · Courses · Course structure ·
Notes/PDFs · Videos · Media library · Question bank · Question import (CSV/XLSX) · Question reports · Quizzes ·
Mock exams · Weekly exams · Previous-year questions · Current affairs · Gorkhapatra (if approved) · News/blog ·
Notices · Notifications/push campaigns · Banners & home sections · Plans/subscriptions · Pricing & coupons ·
Orders/payments/refunds · Invoices/receipts · FAQ & static pages · Progress/results · Support tickets ·
Audit logs · System settings & feature flags.

Cross-cutting: search/filter/sort/pagination, bulk actions, import/export, draft → review → publish (Q35),
scheduling, soft-delete/restore, audit trail, RBAC, preview as student.

## 5. Non-functional requirements [USER + TECH]

- Server-side authorization on every endpoint; premium content never sent to non-entitled clients.
- Payment verification server-side only; idempotent callbacks; amount and order binding; reconciliation job.
- Rate limiting, input validation (Zod), safe uploads, secure headers, audit logs, no secrets in code.
- Pagination everywhere; question banks never loaded wholesale onto devices.
- Exam spike readiness: stateless API, Redis, autosave batching, load test before launch.
- Accessibility: WCAG 2.2 AA contrast, 44pt touch targets, screen-reader labels, dynamic type.
- Poor-network design: caching, retries, offline banners, resumable video, small bundles.
- Nepali Unicode (Devanagari) rendering with a font supporting both scripts (e.g. Noto Sans / Noto Sans Devanagari, or Mukta).

## 6. Design direction (to be finalised with Q1)

The reference has a sound information architecture but a template-like visual layer (black placeholder thumbnails,
duplicated tiles, inconsistent chips, orange titles competing with blue prices, teal colour defined but unused,
blur used as the only lock affordance). Proposed direction:

- **Palette**: deep navy (`#15234D` family) for text/primary surfaces, brand blue (`#3179DD` family) for actions,
  a restrained warm accent (amber/orange) only for highlights (premium, streaks), semantic success/warning/danger.
  Light + dark themes from tokens.
- **Typography**: one family with full Devanagari support for both scripts; scale 32/24/20/16/14/12 refined with line-heights.
- **Components**: unified content-type segmented control, course card with real artwork + clear premium badge,
  progress-aware topic rows (completed/locked/in-progress states replacing the ambiguous red badge),
  explicit lock UI with "Unlock with Premium" CTA instead of blurred text, focused exam mode (no bottom tab bar,
  palette sheet, sticky timer).
- **Motion**: subtle, purposeful (press feedback, accordion, tab transitions, progress fills); reduced-motion respected;
  no animation in exam timing UI.
- Deliverable before mobile build: `DESIGN_SYSTEM.md` + token package + a reviewed screen set.
