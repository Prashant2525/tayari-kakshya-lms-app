# Design System — "Tayari Kakshya"

Status: **v1.0 proposal for owner review** (Phase 3). Implemented as `packages/design-tokens` (consumed by mobile, admin, web).
Brand direction (D-005, Q1): refine the reference's navy + blue identity into a calm, premium, study-focused system.
A real logo will replace the placeholder wordmark when supplied.

## 1. Principles

1. **Calm focus** — learning and exams are high-concentration tasks: generous whitespace, one primary action per screen, no decorative noise.
2. **Clear state** — every item shows whether it is new, in progress, completed, locked or downloaded, using icon + text, never colour alone.
3. **Bilingual by default** — every component is tested with Nepali (Devanagari) and English strings of different lengths.
4. **Fast on modest phones** — flat surfaces, light shadows, no heavy blur/gradients; animations on the UI thread (Reanimated).
5. **Accessible** — WCAG 2.2 AA contrast (checked by an automated test in `design-tokens`), 44×44 pt touch targets, screen-reader labels, dynamic type, reduced motion.

## 2. What changes from the reference PDF

| Reference | Problem | New approach |
|---|---|---|
| Primary blue `#3179DD` with white text | 4.28:1 — fails AA for body text | Primary `#2563D6` (5.48:1) |
| Orange course titles `#FF6B00` | 2.86:1, competes with blue price | Titles in ink; amber reserved for premium/streak highlights |
| Teal `#4FB19D` labelled "dominant" but unused | Inconsistent identity, 2.59:1 | Dropped; green used only for success semantics |
| Black thumbnail placeholders | Looks unfinished | CMS artwork with branded fallback (subject-coloured pattern + initials) |
| Blurred answer as "lock" | Ambiguous; and insecure if real text is sent | Explicit locked card with lock icon + message/CTA; no hidden text sent |
| Red dot badges on videos | Meaning unclear | Status chips: ✓ Completed · ◐ In progress · 🔒 Premium · ⬇ Downloaded |
| Two tab-chip styles | Inconsistent | One segmented control |
| Duplicated shortcut tiles | Clutter | Single row of 3 feature cards |
| Exam shown with bottom tab bar | Distracting, risk of leaving exam | Full-screen exam mode with sticky timer + palette sheet |
| Chat-style Notices | Wrong mental model | Notice cards with type badge (Official / Announcement / Instructor), date (BS), attachment |

## 3. Colour tokens

### Brand & neutrals (light theme)
| Token | Hex | Use | Contrast on white |
|---|---|---|---|
| `ink.900` | `#0F1B3D` | primary text, headings | 16.9:1 |
| `navy.800` | `#15234D` | brand surfaces (header, dark buttons) | 15.2:1 |
| `slate.600` | `#475569` | secondary text | 7.6:1 |
| `slate.500` | `#64748B` | tertiary text, captions (≥14px) | 4.8:1 |
| `slate.300` | `#CBD3DF` | borders strong | — |
| `slate.200` | `#E2E7EF` | borders, dividers | — |
| `slate.100` | `#EEF1F6` | pressed/subtle fills | — |
| `slate.50` | `#F6F8FC` | app background | — |
| `white` | `#FFFFFF` | cards/surfaces | — |

### Primary (blue)
| Token | Hex | Use |
|---|---|---|
| `blue.50` | `#EEF4FF` | selected chip/tab fill |
| `blue.100` | `#DCE7FD` | info backgrounds |
| `blue.300` | `#8FB1F5` | focus ring (with offset) |
| `blue.500` | `#3B73E3` | illustrations, progress fills |
| `blue.600` | `#2563D6` | **primary actions, links** (5.5:1) |
| `blue.700` | `#1A4FB0` | pressed primary (7.5:1) |

### Accent & semantic
| Token | Hex | Use |
|---|---|---|
| `amber.500` | `#F59E0B` | premium badge fill, streak flame (dark text on it) |
| `amber.700` | `#B45309` | amber text (5.0:1) |
| `green.700` | `#15803D` | success text/icons (5.0:1); correct answer |
| `green.50` | `#ECFDF3` | success background |
| `red.700` | `#B91C1C` | errors, wrong answer (6.5:1; red.600 fell below 4.5:1 on red.50) |
| `red.50` | `#FEF2F2` | error background |

### Dark theme (S18)
| Token | Hex | Notes |
|---|---|---|
| `bg` | `#0B1220` | |
| `surface` | `#111A2E` | cards |
| `surface.raised` | `#18233B` | sheets, menus |
| `border` | `#24314D` | |
| `text.primary` | `#E6EAF2` | 15.5:1 on bg |
| `text.secondary` | `#94A3B8` | 7.3:1 on bg |
| `primary` | `#6EA2F5` | links/icons 7.3:1 on bg; primary buttons use `blue.600` fill with white text |

Semantic tokens (`color.text.primary`, `color.surface.card`, `color.action.primary.bg`, …) map to the scales per theme;
components use **only semantic tokens**.

## 4. Typography

- Family: **Mukta** (Google Fonts, OFL) — one family designed for **both Devanagari and Latin**, so mixed Nepali/English
  strings render with consistent metrics. Weights 400, 500, 600, 700. Numerals: tabular for timers/scores.
- Fallback: system font. Line heights are generous to fit Devanagari matras.

| Style | Size / line height | Weight | Use |
|---|---|---|---|
| `display` | 32 / 40 | 700 | onboarding, plan price |
| `h1` | 28 / 36 | 700 | screen titles (large) |
| `h2` | 24 / 32 | 700 | section titles |
| `h3` | 20 / 28 | 600 | card titles |
| `h4` | 17 / 24 | 600 | list titles |
| `body` | 16 / 24 | 400 | reading text |
| `body.reading` | 17 / 28 | 400 | notes/articles reader (adjustable A−/A+) |
| `body.sm` | 14 / 20 | 400 | secondary |
| `label` | 14 / 20 | 600 | buttons, tabs |
| `caption` | 12 / 16 | 500 | meta, badges |
| `mono.timer` | 20 / 24 | 600, tabular | exam timer |

All sizes scale with OS font settings (capped at 1.3× in dense lists; uncapped in reader).

## 5. Spacing, radius, elevation, layout

- Spacing (4-pt): `0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64`. Screen padding 20; card padding 16; list row min height 56.
- Radius: `sm 8` (inputs, chips), `md 12` (cards), `lg 16` (sheets, large cards), `xl 24` (hero), `full` (pills, avatars).
- Elevation: `e0` flat (border only), `e1` `0 1 2 rgba(15,27,61,.06)` + `0 1 3 rgba(15,27,61,.04)`, `e2` `0 4 12 rgba(15,27,61,.08)`, `e3` sheets `0 12 32 rgba(15,27,61,.14)`. Prefer borders over shadows in lists.
- Grid: single column on phones; max content width 640 on tablets (centered), 2-column card grids ≥ 600 dp.
- Icons: **Lucide** (1.75 px stroke, 24 px default, 20 px in dense rows) — same set in admin (lucide-react) and app (lucide-react-native).

## 6. Motion

| Token | Value | Use |
|---|---|---|
| `duration.fast` | 120 ms | press feedback, toggles |
| `duration.base` | 200 ms | tab/segment change, accordion |
| `duration.slow` | 320 ms | sheets, page transitions |
| `easing.standard` | `cubic-bezier(0.2, 0, 0, 1)` | most transitions |
| `spring.sheet` | damping 20, stiffness 220 | bottom sheets |

Rules: animate opacity/transform only; progress bars fill smoothly; correct/incorrect feedback uses a short colour+icon
transition (no shake); **no motion in the exam timer or palette**; honour reduced-motion (crossfade only).

## 7. Component inventory (shared API across platforms where sensible)

**Foundations**: `Text` (variants above, auto-locale), `Icon`, `Surface/Card`, `Divider`, `Spacer`, `Screen` (safe area, padding, background), `Header` (back, title, subtitle, actions), `TabBar`.
**Inputs**: `Button` (primary/secondary/tertiary/destructive; sizes md/lg; loading), `IconButton`, `TextField` (label, hint, error, password toggle), `OTPInput`, `PhoneField` (+977), `Select/Sheet picker`, `BSDatePicker`, `SearchBar`, `Checkbox`, `Radio`, `Switch`, `SegmentedControl`, `Chip/FilterChips`.
**Display**: `Avatar`, `Badge` (status/premium/new), `ProgressBar`, `ProgressRing`, `StatTile`, `EmptyState`, `ErrorState`, `OfflineBanner`, `Skeleton`, `Toast`, `Dialog`, `BottomSheet`, `Accordion`.
**Domain**: `CourseCard` (compact/featured), `CategoryTile`, `PostTile`, `SubjectRow` (marks, duration, progress), `ChapterAccordion`, `TopicRow` (state chips), `VideoPlayer`, `PdfReader`, `RichTextReader`, `QuestionCard` (all types), `OptionItem` (idle/selected/correct/incorrect/disabled), `LockedContentCard`, `ExamTimer`, `QuestionPalette`, `ResultSummary`, `LeaderboardRow`, `StreakBadge`, `NoticeCard`, `NotificationItem`, `ArticleCard`, `PlanCard`, `PaymentMethodCard` (eSewa/Khalti logos per brand guidelines), `OrderStatus`.

## 8. Key screen guidance

- **Auth** (p1–5): white canvas with a soft `blue.50` top band, wordmark, form in a card; password toggle; inline errors;
  OTP screens with auto-advance and resend timer; success state with a check animation.
- **Home** (p6, p29): compact navy header (greeting + bell + avatar) → search → current-course card with progress and
  "Continue" → daily challenge card with streak → feature shortcuts (Gorkhapatra, Weekly Exam, Current Affairs) → banners →
  categories → popular courses. Course switcher as a bottom sheet.
- **Subject** (p10–18): sticky header with subject name + progress; segmented control; chapters as accordions with counts and
  progress ring; topic rows with state chips.
- **Video** (p15): 16:9 player pinned top, title/description, "Up next" list for the topic, prev/next.
- **Reader** (p12): clean reading view, page indicator + jump, A−/A+ font size, bookmark, download (watermark notice).
- **Questions** (p16–17, p45): question cards with marks chip; "Show answer" expands the model answer; locked → `LockedContentCard`.
- **Exam mode** (p19): full-screen, sticky header (title, timer, palette button), one question per page with swipe/next,
  palette sheet (answered / not answered / marked), confirm-submit dialog summarising counts, result screen with score ring,
  section breakdown, rank, "Review solutions".
- **Plans** (p23): plan cards with clear inclusions; on iOS (web-only) the screen shows owned plans/courses and benefits without prices or links.
- **Profile** (p24–26): header card (avatar, name, current course) → grouped settings list (Account, Learning, Preferences, Support, Legal) → Log out → Delete account.

## 9. Admin CMS & website

Same tokens via Tailwind theme; shadcn/ui components themed with semantic tokens; data-dense tables (14px body), sidebar
navigation grouped by domain, command palette (⌘K), consistent form layout with sticky save bar and status pill
(Draft/In review/Scheduled/Published/Archived). Website uses the same type and colour system with larger display sizes.

## 10. Review gate

Before Phase 8 (mobile foundation) I will publish a visual preview of tokens + key screens for owner sign-off.
