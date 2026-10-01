# Implementation Plan

Source: Production Build Playbook §9 roadmap, adapted. Status keys: ☐ not started · ◐ in progress · ☑ done (verified) · ⛔ blocked.
Scope of each phase is limited to **approved** features (`DECISIONS.md`, `SUGGESTED_FEATURES.md`).

| Phase | Name | Outcome | Status |
|---|---|---|---|
| 0 | Requirements discovery | Owner questions asked; scope boundaries drafted | ☑ (questions asked; answers pending) |
| 1 | PDF extraction | `PDF_UI_FEATURE_EXTRACTION.md` (49/49 pages) | ☑ |
| 2 | Suggested features + technology selection | `SUGGESTED_FEATURES.md`, `TECH_STACK_OPTIONS.md` approved; `DECISIONS.md` updated | ⛔ awaiting owner |
| 3 | Architecture | `ARCHITECTURE.md`, `DATABASE_ARCHITECTURE.md` (ERD), `API_DOCUMENTATION.md`, `DESIGN_SYSTEM.md`, monorepo scaffold, CI skeleton | ☐ |
| 4 | Database + backend foundation | Config, Postgres, migrations, ORM, validation, errors, logging, auth, RBAC, rate limits, health checks, tests | ☐ |
| 5 | Admin CMS foundation | Admin auth, RBAC, shell, nav, data table, forms, states, audit-aware actions, media foundation | ☐ |
| 6 | Academic/content CMS | Categories, exam taxonomy, courses, pricing, subjects, chapters, topics, notes, PDFs, videos, media library | ☐ |
| 7 | Question bank + assessment CMS | Question types, import, reports, versioning, quiz/mock/weekly builders, PYQ | ☐ |
| 8 | Student mobile foundation | Navigation, design tokens, components, API client, auth, secure storage, states, caching | ☐ |
| 9 | Student learning | Home, catalog, course detail, enrollment state, subjects→topics, notes, videos, questions, quizzes, bookmarks, report | ☐ |
| 10 | Exam engine | Weekly/mock/PYQ mock, timer, palette, autosave, auto-submit, server scoring, results, history | ☐ |
| 11 | Commerce | Plans, checkout, eSewa, Khalti, ConnectIPS, orders, entitlements, receipts, reconciliation | ☐ |
| 12 | Communication/content | Current affairs, Gorkhapatra (if approved), news, notices, notifications, push, preferences, deep links | ☐ |
| 13 | Progress/personalisation | Analytics, weak areas, mistake notebook, revision, study plan (if approved) | ☐ |
| 14 | Advanced approved features | Only rows approved in `SUGGESTED_FEATURES.md` | ☐ |
| 15 | Security hardening | Authn/authz/IDOR/uploads/payments/rate limits/secrets/logging review | ☐ |
| 16 | Full testing + bug fixing | Systematic test pass; `TEST_STATUS.md` | ☐ |
| 17 | Production audit | `PRODUCTION_READINESS_AUDIT.md` | ☐ |
| 18 | Release | Deployment, monitoring, store readiness, backups, `RELEASE_READINESS.md` | ☐ |

## Phase 3 entry criteria
- 🔴 questions in `OPEN_QUESTIONS.md` answered (at minimum Q2–Q7, Q11, Q17, Q20–Q22, Q24–Q26, Q28, Q36, Q39, Q41, Q42).
- Stack approved and recorded in `DECISIONS.md`.

## Next concrete steps (after approval)
1. Record decisions; revise `FEATURE_SPECIFICATION.md` to v1.0 (remove [REC] items that were rejected).
2. Design system proposal (tokens, type, components) + key screen redesigns for review.
3. ERD + architecture docs; scaffold monorepo on `feature/foundation` branch.
