# PDF UI Feature Extraction — "Tayari Kakshya - LMS System.pdf"

Status: COMPLETE (Phase 1). Source: `Tayari Kakshya - LMS System.pdf` (49 pages, 51 MB, Figma export).
Method: every page was text-extracted (`pdftotext -layout`) **and** rendered to PNG and inspected visually.
Fonts in the PDF are outlined (Type3), so typography is inferred visually (headings resemble *Jost*, body resembles *Inter*).

> The PDF is a **functional reference, not a visual spec**. Sample data (Nepal Police / Army / APF / NID,
> Sainey Likhit, Rs.3000, ratings 4.2, Lorem ipsum) is placeholder and must NOT be hard-coded.

Legend — **BE** = backend implication, **?** = ambiguity requiring owner decision (cross-referenced to `OPEN_QUESTIONS.md` as Qn).

---

## 0. Page index

| Page | Screen / artifact | Type |
|---|---|---|
| 1 | Sign Up | Screen |
| 2 | Login ("Welcome back") | Screen |
| 3 | Forgot password | Screen |
| 4 | Reset password | Screen |
| 5 | Password changed (success) | Screen |
| 6 | Home (catalog-first) | Screen |
| 7 | All Category (category grid) | Screen |
| 8 | Popular Courses (list) | Screen |
| 9 | Course dashboard "Sainey Likhit" (shortcut tiles + subjects) | Screen |
| 10 | Subject › Notes tab (chapters collapsed) | Screen |
| 11 | Subject › Notes tab (chapter expanded → topics) | Screen |
| 12 | Article / document viewer ("1 of 6") | Screen |
| 13 | Subject › Videos tab (chapters collapsed) | Screen |
| 14 | Subject › Videos tab (chapter expanded) | Screen |
| 15 | Video player + description + Previous/Next | Screen |
| 16 | Subject › Questions tab (answers locked) | Screen |
| 17 | Subject › Questions tab (answer revealed but blurred) | Screen |
| 18 | Subject › Quizzes tab (MCQ) | Screen |
| 19 | Weekly Exam (MCQ + progress bar) | Screen |
| 20 | Weekly Exam › "Questions" (empty placeholder) | Screen (stub) |
| 21 | Gorkhapatra › "News" (empty placeholder) | Screen (stub) |
| 22 | Current Affairs › "News" (empty placeholder) | Screen (stub) |
| 23 | Choose Your Plan (Free / Premium) | Screen |
| 24 | Profile — not enrolled | Screen |
| 25 | Profile — enrolled ("Officer Cadet") | Screen (variant) |
| 26 | Edit Profile | Screen |
| 27 | Notification list | Screen |
| 28 | Notices (bottom-nav tab) | Screen |
| 29 | Home — enrolled/course-context variant | Screen (variant) |
| 30 | Login (duplicate of p2) | Duplicate |
| 31 | Notes accordion component (collapsed + expanded) | Component |
| 32 | "गोरखापत्र" (Gorkhapatra) wordmark | Asset |
| 33 | Promo banner carousel "Quiz Day — discount valid today" | Component |
| 34 | Content-type tab chips (two styles) | Component |
| 35 | Category tile (Nepal Police) | Component |
| 36 | Design-system board (icons, type scale, colors, logos, buttons) | Design system |
| 37 | Course card trio | Component |
| 38 | Logo lockup with Nepali tagline | Asset |
| 39 | Illustrations (avatars, category icons) + post tiles | Asset |
| 40 | Course dashboard variant (content tabs at course level) | Screen (variant) |
| 41 | Chapter topic list with "3hrs" | Component |
| 42 | Chapter topic list (flat table) | Component |
| 43 | Notes accordion (expanded) | Component |
| 44 | All Category — sub-category/post variant (illustrated) | Screen (variant) |
| 45 | Chapter-wise Questions (long page; locked vs unlocked answer) | Screen (long) |
| 46 | Video chapter table (counts/durations, nested expanders) | Component |
| 47 | Full subject syllabus (Grammar / Translation / Comprehension) | Component (long) |
| 48 | Profile — not enrolled (grey-placeholder variant) | Variant |
| 49 | Profile — enrolled (grey-placeholder variant) | Variant |

Note: the Playbook's page-range table (§2) is approximate; e.g. it places video at 12–15, the actual player is p15 and p12 is a document viewer. This file is authoritative.

---

## 1. Global patterns

- **Status bar** mock (9:41) on every phone frame; frame 440×956 (≈ iPhone Pro Max logical size).
- **Bottom tab bar** (4 tabs): Home · Courses · Notice · Profile. Active = blue filled icon + blue label.
  Present on most screens incl. deep learning screens; absent on auth, plan, article viewer, edit profile.
- **Back header**: left arrow + title (+ optional subtitle e.g. "Subject / English").
- **Auth layout**: lavender top region (#EBEFFD) with logo + heading, white bottom sheet with rounded top corners containing the form.
- **Reference palette (sampled)**: primary blue `#3179DD`; navy text/buttons `#15234D`; light tint `#E8F0FF` (chips, tabs);
  course-title orange `#FF6B00`; rating star yellow; success green (plan checks). Design board also labels
  *"Dominant color-2 #4FB19D"* (teal) and *"Accent color-3 #4B5563"* (gray) — **teal is not used anywhere in the screens** (?, Q1).
- **Type scale on board**: H1 32 / H2 24 / H3 20 / H4 16.
- **Brand**: "Tayari Kakshya" + Nepali tagline "तयारी भविष्यको" ("preparation for the future"); TK monogram with seated-student pictogram (navy + blue). An alternate "open book with dots" logo also appears on p36 (?, Q1).
- **Placeholders**: course thumbnails are solid black blocks; empty pages 20–22; Lorem ipsum on 15–17, 45.

---

## 2. Screen-by-screen extraction

### P1 — Sign Up
- **UI**: logo; "Sign Up" / "Sign up for free!"; inputs Name, Email, Password; primary "Sign up"; outlined "Sign in with Google"; footer "Already have an account? **Login**".
- **Actions**: submit registration; Google OAuth; navigate to Login.
- **Data**: name, email, password.
- **BE**: `POST /auth/register`, password policy, email uniqueness, Google ID-token verification + account linking, rate limiting, optional email verification.
- **Missing in reference**: password visibility toggle, confirm password/strength hint, terms consent checkbox, phone field (phone appears later in Edit Profile), field-level errors, loading state.
- **?**: Is email verification required? Phone/OTP sign-up? (Q28) Terms acceptance at sign-up? (Q37)

### P2 (dup P30) — Login
- **UI**: "Welcome back" + subtitle; Email; Password; "Forgot password ?" link; "Login"; "Sign in with Google"; "Don't have an account? **Sign up for free**".
- **BE**: `POST /auth/login` → access + refresh tokens, device/session record, brute-force throttling/lockout, generic error messages.
- P30 is a pixel-identical duplicate — no additional requirements.

### P3 — Forgot password
- **UI**: heading "Forget your password?" (typo → "Forgot"); text "Enter your email so that we can send you password reset link"; Email; "Send email"; "‹ Back to login".
- **BE**: `POST /auth/password/forgot` — always returns success (no account enumeration), single-use expiring token, email delivery provider required.
- **?**: link vs OTP code (Q29). A link requires mobile deep linking / universal links.

### P4 — Reset password
- **UI**: "Reset password" / "Please kindly set your password"; New password, Re-enter password (both with eye toggle); button labelled **"Send email"** (copy error → should be "Reset password").
- **BE**: `POST /auth/password/reset` with token; revoke all sessions on reset; password policy.

### P5 — Password changed
- **UI**: "Password changed!" / "You've Successfully Completed Your Password Reset!"; "Log In now".
- Navigation → Login.

### P6 — Home (catalog-first)
- **UI**: blue header: avatar, "Hi, Ashok", "Let's start learning", bell icon; elevated search "Search for.."; **Categories** row (4 round-square icon tiles: Nepal Police, Nepal Army, APF, NID) + "SEE ALL ›"; **Popular Courses** + "SEE ALL ›"; filter chips (All, Sainey likhit [selected], Officer Cadet, Prahari Jawan…) horizontally scrollable; horizontal carousel of course cards (thumbnail, orange title, 3-line description, price "Rs.3000", ★ 4.2).
- **Actions**: open notifications; search; open category; see all categories; filter popular courses by chip; open course; see all courses; profile via avatar(?).
- **Data**: user first name/avatar, unread count, categories (icon, name, order), popular/featured flags, sub-category chips, course summary (thumbnail, title, short description, price, rating).
- **BE**: `GET /home` aggregate (CMS-driven sections), categories, courses with filters, ratings aggregate, unread notification count.
- **?**: what the chips are (posts/sub-categories under a category? course tags?) (Q7); is "popular" curated or computed (Q-admin); ratings require a review system (Q34). No discount/sale price shown though Playbook expects original/sale price (Q20).

### P7 — All Category
- **UI**: back + "All Category"; search field with blue search button; 4-column grid of category tiles (sample is repeated 3×).
- **BE**: paginated categories with search. Tile = icon/logo + name.
- Note: org emblems (Nepal Police, Army, APF, NID) are official insignia — usage rights (?, Q2).

### P8 — Popular Courses
- **UI**: back + "Popular Courses" + search icon; chips (All / Sainey likhit / Officer Cadet / Prahari Jawan); vertical list of full-width course cards.
- **BE**: `GET /courses?sort=popular&tag|post=…` with cursor pagination.

### P9 — Course dashboard ("Sainey Likhit")
- **UI**: title (no back button, Courses tab active); shortcut tiles **Gorkhapatra (गोरखापत्र)**, **Weekly Exam**, **Current Affairs** (row duplicated twice — placeholder duplication); **Subjects** list: number badge, subject name (IQ, Nepali, Math, General Knowledge, English), short syllabus summary ("Writing, Letters, Translation..."), "Total Duration: 3hrs", right-aligned **F.M. 100 / P.M. 24**.
- **Actions**: open Gorkhapatra, Weekly Exam, Current Affairs; open subject.
- **Data**: course, ordered subjects with full marks, pass marks, duration, summary.
- **BE**: F.M./P.M./duration look like **official exam paper metadata** → Subject ≈ Paper (or Paper → Subject). Weekly exams and current affairs are scoped to a course (or global?) (Q8, Q14, Q17).
- **?**: is this the *enrolled* course view or the public course detail? There is **no course detail/purchase screen in the PDF** (no syllabus overview, instructor, validity, enroll/buy CTA) — must be designed (FEATURE_SPECIFICATION §Courses).

### P40 — Course dashboard variant
- Same course with **Notes / Videos / Questions / Quizzes** chips at course level (no Gorkhapatra/Weekly/CA tiles) and subjects with a translate icon instead of numbers.
- Implication: content-type filters may apply at course level too (aggregate across subjects). Reconcile: recommend tiles for course-level features + content tabs inside subject.

### P29 — Home, enrolled / course-context variant
- **UI**: greeting header; search "Search your question"; course title "Sainey Likhit"; Gorkhapatra / Weekly Exam / Current Affairs tiles; Subjects list.
- Implication: after enrollment the Home becomes the learner's active course dashboard; search targets **questions**.
- **?**: Can a user have multiple active courses, and how is the "current" one chosen (Q7)? Search scope: courses vs questions vs all content (recommend unified search with tabs).

### P10 / P11 / P31 / P41 / P42 / P43 / P47 — Subject › Notes
- **UI**: header "Subject / English"; content-type tabs **Notes · Videos · Questions · Quizzes** (icon over label; active = blue); accordion chapters "1. Grammar", "2. Translation", "3. Comprehension"; expanded chapter lists numbered topics (1.1 Articles … 1.10 Use of conjunctions…).
- P47 shows a richer syllabus: chapter-level duration "3hrs" and topic descriptions (e.g. "2.1 Translation from English to Nepali — A passage of about 50–60 words…"), and topics named after **question formats** (3.1 Question Answer, 3.2 Fill in the blanks, 3.3 Match the followings).
- **Actions**: expand/collapse chapter; open topic → article viewer (P12).
- **BE**: Subject → Chapter → Topic hierarchy with ordering, numbering, descriptions, optional duration; topic has one or more note documents.
- **?**: Is "duration" a study-time estimate or exam time allocation (Q8)?

### P12 — Article / document viewer
- **UI**: back + "Article"; pager bar ← [1] of 6 →; empty body.
- **Interpretation**: a paginated document (PDF or multi-page note). Page-number input implies jump-to-page.
- **BE**: secure PDF delivery (signed short-lived URLs), page count metadata, reading progress (last page), possibly watermarking (Q10).
- **?**: rich-text article vs PDF vs both; downloadable/offline? (Q10)

### P13 / P14 / P46 — Subject › Videos
- **UI**: chapters with play icon, "17 videos", total duration "60:03", chevron; expanded topics show per-topic video count badge (1/2/3) + duration; topics with >1 video have their own chevron (nested list). A small **red dot/× badge** on many play icons (meaning unknown).
- **BE**: video ↔ topic (one-to-many), durations aggregated per topic/chapter, ordering, per-user watch progress.
- **?**: red badge meaning — locked/premium? not watched? not downloaded? (Q11). Durations "60:03" ambiguous (mm:ss vs hh:mm) — use h:mm:ss consistently.

### P15 — Video player
- **UI**: header Subject/English; 16:9 player with title + "Description or info text here", time "03:29 / 10:29", seek bar, rewind/play/fast-forward overlay, controls: previous, pause, next, volume slider, fullscreen, overflow (⋮); below: title "Article", "Description", body text; **Previous / Next** buttons.
- **BE**: secure streaming (HLS, signed tokens), resume position, completion events, playback speed/quality in overflow, next/previous ordering within topic/chapter.
- **?**: captions, download/offline, screen-capture protection (Q11).

### P16 / P17 / P45 — Subject › Questions (subjective / chapter-wise questions)
- **UI**: "Chapter 1: Grammar" (P45: "Chapter wise Questions"); question cards: numbered text, "✓ 10 Marks" chip, navy **"Answer 🔒"** button. P17/P45: tapping reveals the model answer **blurred** when locked; P45 also shows an **unlocked** state (open-lock icon) with readable answer.
- **Interpretation**: long-form/subjective question bank with model answers; answers gated by entitlement (premium).
- **BE**: questions with marks, model answer (rich text), access level per item; **answers must not be sent to the client when not entitled** (blur is presentation only — server must withhold content).
- **?**: is the lock tied to course purchase, premium plan, or per-question (Q20/Q22)?

### P18 — Subject › Quizzes
- **UI**: "Chapter 1: Grammar / Multiple Choice Questions"; question cards ("Question 1", stem, 4 pill-shaped options).
- **Missing**: submit, feedback, score, explanation, timer, result — not designed.
- **BE**: quiz entity, MCQ evaluation server-side, attempts, results.
- **?**: instant feedback vs submit-at-end; retakes; explanations (Q13).

### P19 / P20 — Weekly Exam
- **UI P19**: "Weekly Exam / Multiple Choice Questions", progress bar "0% Complete", all questions on one scrolling page with pill options.
- **UI P20**: "Weekly Exam / Questions" — blank stub.
- **Missing**: exam list/schedule, instructions, timer, question palette, mark for review, submit confirmation, results, rank/leaderboard, history. (Design entry point: "View weekly exams" orange locked button on P36 suggests weekly exams can be **locked/premium**.)
- **BE**: scheduled exam entity, start/end window, duration, server-side timer and auto-submit, autosave, scoring with negative marking, result publication.
- **?**: all rules (Q17).

### P21 — Gorkhapatra › News (stub) / P32 wordmark
- Blank page titled "Gorkhapatra" with tab/heading "News". Gorkhapatra is Nepal's state-owned daily newspaper.
- **?**: what content (e-paper, curated article summaries, links, Lok Sewa vacancy notices published in Gorkhapatra?), and **copyright/licensing** (Q14). Must not scrape/republish without rights.

### P22 — Current Affairs › News (stub)
- Blank; heading "News". **BE**: CMS-driven articles with date, category, source; optional quizzes (Q14).

### P23 — Choose Your Plan
- **UI**: logo; "Choose Your Plan" / "Find the right plan to start learning today."; card **Free / FOREVER** — ✓ Free Notes, ✓ Limited Quizzes and Videos, ✓ Old Questions; outlined "Get Started"; card **Premium / FOREVER** (cut off: features, price and CTA not visible).
- **BE**: plans with feature lists, price, duration, entitlements; checkout.
- **?**: Premium price, duration ("forever" = lifetime?), what it unlocks, relation to per-course price Rs.3000 (Q20–22). P36 shows a **"khalti"** chip and **VISA / bank** icons → payment-method selection screen implied but not designed.

### P24 / P25 / P48 / P49 — Profile
- **UI**: back + "Profile"; large avatar with "Edit" pill; name; status line ("Not enrolled" or enrolled course name "Officer Cadet"); menu rows with icons: Email (shows address), Change password, Notification, Enrolled course, Subscription plan, About Us, Terms and Condition, Privacy Policy, Blog, Log out. P48/P49 are lower-fidelity versions (grey icon placeholders) — same content.
- **BE**: profile, change password, notification preferences, enrollments, subscription status, CMS static pages (About/Terms/Privacy), blog, logout (revoke refresh token).
- **Missing**: Refund policy, FAQ/Help, Support/contact, Delete account (store requirement), language, theme, app version.
- **?**: status line implies **one primary enrolled course** (Q7).

### P26 — Edit Profile
- **UI**: avatar with image-picker badge; fields Full Name, Date of Birth (calendar), Email, Phone with Nepal flag + country picker "(+977) 9841638390", Gender (dropdown), "Student" (unlabelled field — occupation/role?); pill "Update →".
- **BE**: profile update with validation, avatar upload (image type/size limits, re-encode), email change requires re-verification, phone format E.164.
- **?**: meaning of "Student" field; DOB in BS or AD; gender options; which fields required (Q30).

### P27 — Notification list
- **UI**: cards with type icon (orange card icon = purchase; blue chat icon = message), truncated title ("Successful purchase!", "Congratulations on completing the…", "Your course has been updated, you…"), relative time "Just now".
- **BE**: per-user notifications, types, read/unread, deep links, pagination, push delivery.
- **Missing**: unread state, mark-all-read, detail view, empty state.

### P28 — Notices (bottom-nav tab)
- **UI**: cards with avatar placeholder, sender "Bert Pullman", "Online", time "04:32 pm", message "Congratulations on completing the first lesson, keep up the good work!".
- **Interpretation**: looks like a chat/messaging template reused as placeholder. Conflicts with the Notification list.
- **?**: what "Notice" is — official exam notices (PSC/Police vacancy notices), admin announcements, or instructor messages/chat (Q15).

### P33 — Promo banner carousel
- "Quiz Day — Get a Discount for Every Course Order only Valid for Today.!" with pagination dots.
- **BE**: CMS banners (image, title, CTA deep link, schedule, audience); discount campaigns/coupons (Q23).

### P34 — Content-type tab chips
- Two styles: icon-over-label (used in screens) and icon-left pill. Pick one in design system.

### P35 / P39 / P44 — Category & post tiles, illustrations
- Category tile = emblem in rounded square + label.
- P44 "All Category" variant: **sub-category level** (Sainey Likhit, Prahari Jawan, Officer Cadet) with illustrated avatars → implies **Category (organisation) → Post/Exam (sub-category) → Course** navigation.
- P39 illustrations: police/army avatars, "house with reader", podium, monitor-with-globe — candidate icons for posts and feature tiles.

### P36 — Design-system board
- **Icons**: book, bookmark, search, play, VISA, bank, chat, mail, phone, chevron, Google, close, home, user-tie, monitor, briefcase, notes, video, idea/quiz, document; filled/outlined pairs for chat, graduation cap (Courses), home, bookmark, document, quiz, video, help, user.
- **Components**: "khalti" dark chip (payment method), orange "🔓 View weekly exams" button.
- **Type**: H1 32 / H2 24 / H3 20 / H4 16.
- **Colours**: "Dominant color-2 #4fb19d", "Accent color-3 4B5563" (primary colour-1 not labelled; screens use #3179DD).
- **Logos**: TK pictogram lockups (3 sizes), large stacked "TAYARI KAKSHYA", navy square TK monogram (app icon candidate), alternate "book + dots" mark.
- **Bookmark icons present** → bookmarking content intended though no screen shows it.

### P37 — Course cards
- Three cards (Sainey Likhit, Officer Cadet, Prahari Jawan): black thumbnail, orange title, description, blue price, ★ rating.

---

## 3. Navigation map (as implied by the PDF)

```
Auth: SignUp ⇄ Login → ForgotPassword → (email link) → ResetPassword → PasswordChanged → Login
Tabs:
 ├─ Home ── Search
 │    ├─ Categories (See all) → All Category → [Category] → Posts (P44) → Courses
 │    ├─ Popular Courses (See all) → Course list → Course
 │    └─ Bell → Notifications
 ├─ Courses ── Course dashboard (P9/P40)
 │    ├─ Gorkhapatra → News list
 │    ├─ Weekly Exam → Exam
 │    ├─ Current Affairs → News list
 │    └─ Subject → [Notes | Videos | Questions | Quizzes]
 │          Notes → Chapter → Topic → Document viewer
 │          Videos → Chapter → Topic → Video player (prev/next)
 │          Questions → Chapter → Question → Answer (locked/unlocked)
 │          Quizzes → Chapter → MCQ quiz
 ├─ Notice ── Notices
 └─ Profile ── Edit profile, Change password, Notification prefs, Enrolled course,
               Subscription plan (→ Choose Your Plan → payment), About, Terms, Privacy, Blog, Logout
```

## 4. Screens required but absent from the PDF (gaps)

Course detail / purchase page · checkout & payment-method selection · payment pending/success/failure · receipt ·
quiz result & review · exam list, instructions, palette, timer, submit, result, history · current-affairs article detail ·
news/Gorkhapatra detail · notice detail · notification detail & preferences · enrolled-course list · subscription status ·
change password · email verification · search results · bookmarks · progress/analytics · mistake notebook · study plan ·
FAQ/help/support · refund policy · account deletion · empty/loading/error/offline states for every screen · onboarding
(target exam selection) · splash · force-update screen.

## 5. Consolidated ambiguities (→ OPEN_QUESTIONS.md)

1. Exam scope: security forces (sample) vs Lok Sewa (PSC) vs both (Q2–Q3).
2. Category → Post → Course relation, multiple enrolled courses (Q7).
3. Subject F.M./P.M./duration semantics; Subject vs Paper (Q8).
4. Notes format (PDF vs rich text) and offline/download (Q10).
5. Video red badge meaning; video hosting/offline (Q11).
6. Quiz feedback mode (Q13); weekly-exam rules (Q17).
7. Gorkhapatra content and rights (Q14).
8. Notice tab meaning (Q15).
9. Free vs Premium vs per-course purchase; "forever" (Q20–22).
10. Brand colour (blue vs teal #4FB19D) and logo choice (Q1).
11. Edit-profile "Student" field; DOB calendar BS/AD (Q4, Q30).
12. Ratings/reviews system (Q34).
