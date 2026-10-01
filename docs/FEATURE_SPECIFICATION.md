# Feature Specification v1.0

Status: **APPROVED SCOPE** (2026-10-02). Decisions referenced as D-### / T-### (`DECISIONS.md`), PDF pages as p##
(`PDF_UI_FEATURE_EXTRACTION.md`), approved suggestions as S## (`SUGGESTED_FEATURES.md`).

Rule: every business value (price, validity, marks, negative marking, limits, tax, copy) is CMS data. Nothing below
implies a hard-coded value.

---

## 1. Surfaces

| Surface | Users | Tech |
|---|---|---|
| Student app (Android + iOS) | Students | Expo / React Native (T-001) |
| Admin CMS (web) | Staff by role | React + Vite (T-012) |
| Public website | Visitors, students | Next.js (T-015): course pages, web checkout, legal/static pages, blog, certificate verification |
| API + worker | — | NestJS (T-002), PostgreSQL, Redis/BullMQ |

## 2. Student app

### 2.1 Onboarding & accounts
- Splash, language choice (English/नेपाली, D-008), onboarding with **target exam/post selection** (S1).
- Sign up: name, email, password; **Google** sign-in (p1–2, D-029). Terms/Privacy acceptance.
- Verification via **email OTP and/or phone OTP** depending on CMS toggles; user picks when both are enabled (D-029).
- Login, logout, **forgot/reset password by OTP** (p3–5, D-030), change password.
- Session management: list of devices, sign out others; **device limit** enforced (D-028).
- **Account deletion** with 7-day grace (D-032).

### 2.2 Home (p6, p29)
- Greeting, avatar, notification bell (unread badge), **unified search** (S3: courses, questions, notes, articles).
- **Current-course switcher** when the student has several courses (D-011); course shortcuts (Gorkhapatra, Weekly Exam, Current Affairs) and subjects for the current course (p29).
- Continue learning, **daily challenge** + streak (S9, D-022), upcoming exams, latest notices, progress snapshot.
- CMS banners/carousel (p33) and CMS home sections; categories row; popular/featured courses with chips (p6).

### 2.3 Catalog & course
- Category (authority) → post → courses (p7, p44); course list with filter chips + search (p8).
- Course card (p37): artwork, title, short description, price/sale price (Android/web only — **hidden on iOS**, D-027), rating.
- **Course detail page** (S2): overview, what you'll learn, subjects with full/pass marks and duration (p9, D-012), instructors (D-013), lesson/video/question counts, validity, preview items, reviews (S4), CTA (buy / unlock / continue).
- Course dashboard (p9, p40): shortcuts + subjects; **My courses** list.

### 2.4 Learning (p10–p15, p31–p47)
- Subject screen with segmented tabs **Notes · Videos · Questions · Quizzes**; chapter accordions; numbered topics with descriptions/durations.
- Notes: **rich-text reader** and **PDF viewer** with page jump + resume (p12); **watermarked PDF download** (D-014) and offline library (S11).
- Videos: per topic lists with counts/durations; player with ±10s, prev/next, speed, quality, fullscreen, resume, completion tracking (p15). Providers: Bunny Stream (offline download, screen-capture protection on premium — S20) or YouTube unlisted embed (D-015).
- Item states: completed / in progress / locked (premium) / downloaded — replaces the ambiguous red badge (p14).
- Locked items show an explicit lock and, on Android/web, an "Unlock" CTA; on iOS a neutral "Premium content" message (D-027). **Locked content is never sent by the API.**

### 2.5 Questions & practice
- Chapter-wise subjective questions with marks and model answers (p16, p17, p45); MCQ and all engine types (D-016).
- Explanations, sources/year, **bookmarks** (S5), **report question**, **discussion/doubts** per question/topic (S12).
- **Previous-year questions** browsable by authority/post/paper/year (D-020) and PYQ mock mode.
- **Mistake notebook** + revision mode (S6).

### 2.6 Assessments (D-021, D-022)
- Types: chapter/topic quiz, subject test, **weekly exam**, full **mock**, **PYQ mock**, **daily challenge**.
- Flow: list (upcoming/live/completed) → instructions → **exam mode** (no tab bar; sticky server-synced timer; question palette with answered/unanswered/marked states; mark for review; autosave; resume after disconnect) → submit confirmation → auto-submit at deadline → result (score, accuracy, time, per-subject breakdown, pass/fail) → solutions + explanations → attempt history.
- Result release per CMS config (immediate / after window / manual); **leaderboard/rank** when enabled (S10).
- Subjective answers in exams: self-evaluation against model answer or instructor grading (CMS setting per assessment).
- **Certificates** (S14) when CMS rules are met; verifiable on the website.

### 2.7 News & communication
- **Current affairs** (daily/weekly/monthly/yearly digests, categories, linked quizzes) (p22).
- **Gorkhapatra**: team-written summaries with date + source link (D-018) (p21).
- News/blog articles (p24 "Blog").
- **Notice tab** (p28): official exam notices/vacancy alerts (S15), announcements, instructor messages; targetable by audience; attachments; pinned (D-019).
- **Notifications** (p27): push + in-app + email; events purchase, course update, exam reminder, result; preferences per category (D-033).

### 2.8 Commerce (D-023 … D-027)
- Plans screen (p23) with CMS plans (e.g. Free/Premium, lifetime allowed) and per-course purchase.
- **Android**: checkout in app → coupon → method (eSewa/Khalti) → provider page → return → server verification → success/pending/failed screen → receipt.
- **iOS**: no prices/purchase UI/external links; purchases made on the website unlock automatically (same account).
- **Website**: same checkout for all users.
- My purchases, receipts/invoices (VAT settings per D-026), subscription/plan status and expiry.
- **Referral program / promo codes** (S19).

### 2.9 Progress & personalisation
- Course/subject/chapter/topic progress; study time; score/accuracy history; weak/strong topics (S8).
- **Study planner** from target exam date (S7); bookmarks; mistake notebook; streaks.

### 2.10 Profile, settings & support
- Profile (p24–25): avatar, name, current course; edit profile (p26): full name, DOB (BS picker), email (re-verify on change), phone (+977), gender, **education level** (D-031).
- Settings: language, theme (light/dark/system, S18), notification preferences, downloads, devices, delete account.
- About, Terms, Privacy, Refund (CMS static pages; drafts by Claude per D-038), FAQ/help, **contact options** (D-034), app version.
- **Force-update / maintenance** screens (S24).

### 2.11 Advanced (approved; sequenced late — see plan)
- **AI study assistant** (S13): explain an answer, summarise a note — provider/budget pending (L2).
- **Live classes** (S22) — provider pending (L3).

## 3. Academic & content model (D-010)

```
EXAM TAXONOMY (admin-managed tree; node types ordered, any level optional)
authority → level → service → group → post         e.g. Nepal Police → (post) Prahari Jawan
post ──< post_papers >── paper (full marks, pass marks, duration, pattern)

CONTENT TREE (reusable across courses)
subject → chapter → topic → learning items (note | pdf | video) and questions

COURSE
course ──< course_exam_nodes (posts it prepares for)
course ──< course_subjects (ordered subject, optional paper, display marks/duration)
course ──< course_instructors

ACCESS
item.access_level ∈ {free, premium}; premium requires an active entitlement for a course that includes the item's subject,
or a plan that covers that course. Entitlements come from orders, plans, coupons (100%), referrals, or admin grants.
```

## 4. Admin CMS

Modules (each with list/search/filter/sort/pagination, create/edit, preview-as-student (S23), status workflow,
scheduling, soft-delete/restore, audit trail, import/export where useful):

Dashboard & analytics · Users & students (profile, devices, entitlements, attempts, manual grants) · Staff, roles &
permissions (D-036) · Exam taxonomy · Papers · Courses (pricing, validity, instructors, subjects) · Subjects/Chapters/Topics
(drag-reorder) · Notes (rich text) · PDFs · Videos (Bunny upload / YouTube link) · Media library · Question bank (all types,
versions, tags, PYQ metadata) · Question import (CSV/XLSX with validation preview) · Question reports · Assessments builder
(quiz/daily/weekly/mock/PYQ; blueprints) · Grading queue (subjective) · Leaderboards · Certificates (templates, rules,
issued) · Current affairs / Gorkhapatra / News / Blog · Notices · Notification campaigns & templates · Banners & home
sections · Plans · Coupons & sales · Referrals · Orders · Payments & reconciliation · Refunds · Invoices · Reviews
moderation · Discussions moderation · FAQ & static pages · Contact options · App settings (verification channels, device
limit, purchase channels per platform, force update, maintenance, tax, invoice numbering) · Audit log.

Workflow: `draft → in_review → published` (+ `scheduled`, `archived`). Users with `publish` permission can publish directly;
others submit for review (D-036).

## 5. Non-functional requirements

- **Security**: server-side authorization on every endpoint; scoped instructor permissions; premium payloads withheld;
  payment verification server-side with idempotency, amount/order binding, replay protection, reconciliation; rate limits;
  Zod validation; safe uploads (type sniffing, size limits, re-encoding); secure headers; secrets only in env; audit logs.
- **Performance at our scale (D-040)**: p95 API < 300 ms on the VPS for common reads; weekly-exam start burst of all
  active students handled (autosave batched, Redis-backed timers).
- **Reliability**: idempotent exam submission; offline-tolerant autosave queue on device; scheduled jobs retried.
- **Accessibility**: WCAG 2.2 AA contrast (palette verified), 44pt targets, screen-reader labels, dynamic type, reduced motion.
- **Localization**: en/ne UI; localized CMS fields; BS date display (D-009); Devanagari-capable font; NPR formatting (e.g. रु 3,000 / Rs 3,000).
- **Poor networks**: caching, retries, offline banner, resumable/adaptive video, small bundles, image CDN sizes.
- **Privacy**: minimal personal data; deletion workflow; analytics without PII; consent text in Privacy Policy.
