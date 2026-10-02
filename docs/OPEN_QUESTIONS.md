# Open Questions — Owner Decisions Required

Status: **ALL ANSWERED (2026-10-02)** — recorded in `DECISIONS.md`. Follow-up clarifications are at the bottom of this file.
New questions that arise later are appended under "Later questions".

Priority: 🔴 = blocks architecture/database design (Phase 2–3) · 🟠 = blocks a specific module later · 🟢 = can be answered later.
Where I propose a default it is marked **Proposed** — it is NOT adopted until you confirm.

---

## A. Product scope & brand

- **Q1 🟠 Brand.** Is "Tayari Kakshya" (tagline "तयारी भविष्यको") the final app name? Do you have vector logo files (SVG/AI/Figma)? Which mark is primary — the TK seated-student pictogram or the open-book-with-dots mark? Brand colour: the screens use blue `#3179DD` + navy `#15234D`, but the design board labels teal `#4FB19D` as "dominant". Which is the brand colour, and may I refine the palette (Proposed: keep navy + blue as the brand, refine tints, use orange only for highlights)?
Ans - I don't have logo as of now I will add it later. And for brand color Refine the palette (The best one)
- **Q2 🔴 Exam scope.** The PDF's sample data is security-force recruitment (Nepal Police, Nepal Army, APF, NID — Sainey Likhit, Officer Cadet, Prahari Jawan). The Playbook calls the product a *Lok Sewa* LMS. Which is in scope **at launch** and later: (a) Lok Sewa Aayog (federal PSC), (b) Provincial PSCs, (c) Nepal Police / Army / APF / NID, (d) others (Teachers Service Commission, banks, corporations)? Do you have permission to use the organisations' official emblems shown on category tiles?
Ans - I should be able to add any of the category and yes at start add (Nepal Police, Nepal Army, APF, NID — Sainey Likhit, Officer Cadet, Prahari Jawan) but I should also be add loksewa categories easily later.
- **Q3 🔴 Launch catalogue.** Which exact posts/levels/courses will exist at launch (e.g. "Kharidar", "Nayab Subba", "Section Officer", "Sainey Likhit"…)? Even a rough list lets me validate the hierarchy.
Ans - I should be able to manage this througn admin portal like which posts/levels/courses will exist at launch
- **Q4 🔴 Language & calendar.** UI language: English only, Nepali only, or bilingual with a toggle? Content language: per item Nepali/English/both? Dates: Bikram Sambat (BS), AD, or both displayed (affects DOB, exam schedules, current-affairs dates)?
Ans - bilingual with a toggle, and dates BS
- **Q5 🔴 Platforms.** Android only at launch, or Android + iOS? (Directly affects payments — see Q26.) Is a student **web** app wanted, or mobile only?
Ans - Andriod + IOS

## B. Academic model

- **Q6 🔴 Hierarchy.** Proposed model (see `FEATURE_SPECIFICATION.md §3`): a configurable **exam taxonomy** (Authority/Organisation → Level/Examination → Service → Group → Post, any level optional per authority) + **Paper** → **Subject** → **Chapter** → **Topic** → content items; **Courses** link to one or more Posts/Papers. Do you approve? Should subjects/chapters/questions be **shared and reused** across courses (e.g. one "General Knowledge" bank used by many posts — Proposed) or copied per course?
Ans - Yes i approve the proposed hierarchy
- **Q7 🔴 Course definition.** Is a "course" = a complete prep package for one post (e.g. "Sainey Likhit")? Can one student hold **several** active courses? The profile shows one course under the name and P29 makes Home course-specific — should Home show a "current course" switcher? What are the chips under Popular Courses (posts, tags, or course groups)?
Ans - student can have several active courses
- **Q8 🟠 Paper metadata.** Subjects show "F.M. 100 / P.M. 24 / Total Duration: 3hrs". Are these official exam-paper values (full marks, pass marks, paper time) entered by admins? Is the chapter "3hrs" a study estimate or exam allocation?
Ans - Entered by admins
- **Q9 🟢 Instructors.** Are instructors shown to students (profile, bio)? Will instructors log in to the CMS themselves to upload content?
Ans - Yes instructors shown to students, only to upload content (In admin portal the main boss will have all the access and boss can give permissions to other peoples like instrictors and the feature he can use)

## C. Content & learning

- **Q10 🟠 Notes.** Format: rich-text articles, PDFs, or both? (P12 "1 of 6" looks like a paged PDF.) May students download notes for offline use? Should PDFs be watermarked with the user's identity to deter sharing?
Ans - Both, can download with watermark
- **Q11 🔴 Videos.** Will you upload original video files (needs transcoding + secure streaming) or use YouTube/Vimeo links? Approximate total video hours at launch and in year 1? Offline downloads in-app? Screen-recording protection/DRM needed? What does the small red badge on video icons in P14 mean (locked / not watched / not downloaded)?
Ans - Video should play on app itself but i will fetch that video from youtube api (and in youtube channel those videos will kept in private so that they need to come to app to watch that video)
- **Q12 🟠 Question types.** The PDF shows (a) subjective questions with marks + model answer and (b) single-answer MCQs. Which of these are needed at launch: multiple-answer, true/false, fill-in-the-blank, match-the-following, numerical, image-based questions/options, passage-based (comprehension)?
Ans - I should be able to manage through admin portal
- **Q13 🟠 Quiz behaviour.** Instant feedback after each answer, or results only after submit? Show explanations? Unlimited retakes? Timed?
Ans - Only after submission, show explanations, unlimited retaked and timed. Also these should be able to manage from Admin portal
- **Q14 🟠 Gorkhapatra & current affairs.** What exactly is the "Gorkhapatra" section — curated summaries of Gorkhapatra articles, the e-paper, links, or Lok Sewa vacancy notices published there? **Do you have rights** to republish Gorkhapatra content? For current affairs: daily/weekly/monthly digests? Written by your team? Should current affairs include quizzes? Are these per-course or global?
- **Q15 🟠 "Notice" tab.** The PDF Notices page looks like chat messages ("Bert Pullman · Online"). Is "Notice" meant to be: (a) official exam/vacancy notices, (b) admin announcements, (c) instructor ↔ student messages, or (d) something else? (Notifications already exist separately behind the bell.)
Ans - Official exam notices, announcements, instructors message. And should be able to manage from admin portal
- **Q16 🟠 Previous-year questions.** Source of previous-year questions and do you hold rights to them? Are model answers written by your team?
Ans - Yes i have rights. Should be able to manage from admin portal

## D. Exams

- **Q17 🔴 Weekly exam rules.** Fixed schedule (everyone sits in the same time window) or available any time during the week? Duration, number of questions, marks per question, **negative marking** (rate?), pass mark, number of attempts, result timing (instant vs after window closes), **rank/leaderboard**? Free or premium? Per course or global?
Ans - Should me able to manage from Admin Portal
- **Q18 🟠 Mock exams.** Should full mock tests follow official paper blueprints (per-subject question counts/marks)? Subjective questions in exams — self-evaluated by the student, manually graded by instructors, or not included?
Ans - Should be able to manage from admin portal
- **Q19 🟢 Engagement.** Daily challenge, streaks, leaderboard, certificates — wanted at launch, later, or never?
Ans - at launch

## E. Commerce

- **Q20 🔴 Business model.** The PDF shows both **per-course prices** (Rs.3000) and **Free / Premium plans**. Which model(s): (a) buy individual courses, (b) subscribe to a plan that unlocks everything or a set of courses, (c) both? What does Premium unlock and what does it cost? Does "Premium / forever" mean a one-time lifetime purchase?
Ans - Both, and yes forever means lifetime. I should be able to manage from admin portal
- **Q21 🔴 Validity.** How long does access last — fixed months, until a date (e.g. exam date), or lifetime? Renewal/auto-renewal? (Note: Nepali wallets generally do not support recurring auto-debit; renewals would be manual.)
Ans - Should be able to manage from admin portal
- **Q22 🔴 Free tier.** "Free Notes, Limited Quizzes and Videos, Old Questions" — Proposed: admins mark each content item Free / Premium. Is that acceptable, or do you want numeric limits (e.g. first N videos)?
Ans - Yes through admin portal
- **Q23 🟠 Discounts.** The PDF has a "discount valid today" banner. Do you need coupon codes, time-limited sale prices, or both? Any per-user limits?
Ans - Should be able to manage from admin portal
- **Q24 🔴 Tax & invoices.** Is the business registered (PAN/VAT)? Must receipts be VAT invoices (IRD-compliant numbering)? Are displayed prices VAT-inclusive? Refund policy (any refunds? within how many days? who approves?).
Ans - Should be able to manage from admin portal
- **Q25 🔴 Merchant accounts.** Do you already have **eSewa**, **Khalti** and **ConnectIPS** merchant accounts? Under which legal entity? (ConnectIPS merchant onboarding is through NCHL via a sponsoring bank and issues a signing certificate.) Which gateways are required at launch?
Ans - At launch add esewa and khalti, Yes I have merchant account
- **Q26 🔴 App-store payment policy.** Apple's App Store generally requires In-App Purchase for digital content unlocked in-app; Google Play also has billing-policy requirements for digital goods. Options: (a) Android-first with local gateways after confirming Google Play policy for Nepal, (b) sell on a website and let the app unlock purchases ("reader"-style, no in-app purchase links on iOS), (c) use Apple/Google billing on stores + local gateways on web. I will verify current store policy before Phase 11 — but I need your direction and risk appetite.
Ans - If esewa, khalti, connectIPS provides in app support, integration then go with Apple/Google and the user are able to pay through app to esewa, khalti, etc, if not possible then go with option(b) sell on a website and let the app unlock purchases ("reader"-style, no in-app purchase links on iOS) and later both
- **Q27 🟠 Account sharing.** Limit the number of devices/concurrent sessions per account (e.g. 1 phone + 1 tablet)? What happens when exceeded?
Ans - Yes limit. And should be able to change or manage through admin portal

## F. Accounts & communication

- **Q28 🔴 Sign-up methods.** Email + password and Google (as in PDF). Also phone number + SMS OTP? Is email verification mandatory before learning? Is phone mandatory?
Ans - Email + password and Google. There should be option like verify with email or phone toggle
- **Q29 🟠 Password reset.** Email link (as in PDF, needs deep links) or a 6-digit OTP code by email/SMS (Proposed: OTP code — simpler and more reliable on mobile)?
Ans - OTP
- **Q30 🟢 Profile fields.** What is the unlabelled "Student" field on Edit Profile (occupation? education level?) Which fields are required? Gender options?
- **Q31 🟠 Account deletion.** Store policies require in-app account deletion. Confirm: self-service deletion, with legally required financial records retained/anonymised?
- **Q32 🟠 Notifications.** Which channels: push, in-app, email, SMS? Which events (purchase, course update, exam reminder, result, new current affairs, marketing)? Marketing opt-in?
Ans - in app and email. Events: purchase, course update, exam reminder, result
- **Q33 🟠 Support.** In-app support tickets, or contact options (phone/WhatsApp/email/Viber)? Your support contact details?
Ans - Contact Options
- **Q34 🟢 Optional features.** See `SUGGESTED_FEATURES.md` — please mark each Approve / Later / Reject (ratings & reviews, discussion/doubts, AI assistant, offline downloads, gamification, certificates, study planner, etc.).
Ans - I approved this

## G. Admin, operations & environment

- **Q35 🟠 Admin roles & workflow.** Which roles are needed at launch (Super Admin, Admin, Content Manager, Question Manager, Instructor, Finance Manager, Support Agent, Editor)? Must content go through draft → review → publish approval, or can editors publish directly?
Ans - Super Admin and super admin should be able to assign roles like admin , content manager, etc with selected permissions 
- **Q36 🔴 Hosting & budget.** Monthly infrastructure budget range? Preference/constraint for hosting region (e.g. AWS Mumbai, DigitalOcean Bangalore, Hetzner, or Nepal-based hosting for data-residency)? Domain name(s) owned?
Ans - Nepal based hosting(VPS) and i will go with VPS
- **Q37 🟠 Legal content.** Will you supply Terms, Privacy Policy, Refund Policy, About Us? (I will not write legal text as if it were final.)
Ans - first write all these on your own and then i will inspect that and suggest you what to change
- **Q38 🟢 Monitoring/analytics.** OK to use Sentry (errors) and PostHog or Firebase Analytics (product analytics)?
Ans - PostHog
- **Q39 🔴 Scale.** Expected registered users at launch and in year 1; **peak concurrent students during a weekly exam**; expected video viewers at peak.
Ans - At launch max like 250-500 and in 1 year max like 1000
- **Q40 🟠 Git workflow.** Proposed: `main` = protected/stable, work on `feature/*` branches, push branches and open PRs that you merge (or allow me to merge). OK? Also, the 51 MB design PDF is committed to the repo (GitHub warns above 50 MB) — keep it, move it to Git LFS, or remove it from future history (no history rewrite without your approval)?
Ans -  OK to use feature branches with PRs into main. And remove that design PDF from github
- **Q41 🔴 Dev environment.** This machine has Node 24 and npm but **no Docker and no PostgreSQL**. Options: (a) install Docker Desktop (Proposed — runs Postgres + Redis locally), (b) install PostgreSQL natively, (c) use a free cloud dev database (e.g. Neon). Do you have Android Studio / an Android device for testing?
Ans - go with opiton (a). I have android Studio
- **Q42 🔴 Technology stack.** Approve the recommended stack in `TECH_STACK_OPTIONS.md` (or tell me which rows to change).
Ans - I approve the tech stack(all the recommended tech stack)

---

## Follow-up clarifications (2026-10-02)

| Q | Issue found | Owner's choice |
|---|---|---|
| Q11 | YouTube **private** videos cannot be played by app users (only ≤50 invited Google accounts). | **Hybrid**: Bunny Stream for premium, YouTube unlisted for free/promo, chosen per video (D-015). |
| Q26 | Nepal-based developers cannot register a Google Play merchant account; Apple requires IAP for unlocking courses (education is not a "reader" app). | **Android in-app eSewa/Khalti + iOS buys on website, app unlocks** (D-027). |
| Q32 | Push not mentioned. | **Include push** + in-app + email (D-033). |
| Q40 | How to remove the design PDF. | **Untrack going forward**, no history rewrite (D-041). |
| Q14 | Unanswered. | Gorkhapatra = **team-written summaries** with source link (D-018). |
| Q36 | Strictness of Nepal hosting. | **Server + DB in Nepal**; files on R2, premium video on Bunny (D-037). |
| Q31 | Unanswered. | **Self-service deletion + 7-day grace**, financial records kept anonymised (D-032). |
| Q30 | Unanswered. | "Student" field = **Education level** (D-031). |

Sources checked: Apple App Review Guidelines §3.1.1/§3.1.3/§5.1.1(v); Google Play Payments policy and
supported merchant locations (Nepal: developer ✔, merchant ✘); YouTube private/unlisted embedding behaviour.

## Later questions (not blocking now — will be asked when the phase starts)

- **L1 (Phase 4/8):** SMS provider for phone OTP (e.g. Sparrow SMS / Aakash SMS) and email provider + sending domain.
- **L2 (Phase 14):** AI study assistant (S13) — model provider, monthly budget cap, which features (explain answer, summarise note).
- **L3 (Phase 14):** Live classes (S22) — provider (YouTube Live unlisted, Zoom, other) and recording policy.
- **L4 (Phase 18):** Specific Nepal VPS provider/specs, domain names, backup location (offsite encrypted backups outside Nepal acceptable?).
- **L6 (Phase 6, asked 2026-10-02):** A course priced at 0 — should its *premium* items open to every signed-in
  student, or should students tap "Enrol" (creating a free entitlement, so it appears in My courses and analytics)?
  *Until answered, the API treats price 0 as display-only: premium items still need an entitlement (granted by admin).*
- **L5 (Phase 18):** App identifiers (`com.<org>.<app>`), store account ownership (Play Console organisation account, Apple Developer).
