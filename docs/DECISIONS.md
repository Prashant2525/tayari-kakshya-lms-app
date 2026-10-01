# Decisions Log

Format: `D-### | date | decision | rationale | decided by`. Only owner-confirmed product/business decisions and
approved technical decisions belong here. Proposals live in `OPEN_QUESTIONS.md` / `TECH_STACK_OPTIONS.md` until approved.

## Confirmed

| ID | Date | Decision | Rationale | By |
|---|---|---|---|---|
| D-001 | 2026-10-02 | Mobile app uses **React Native** | Owner preference (master prompt) | Owner |
| D-002 | 2026-10-02 | **PostgreSQL** is the canonical primary database | Owner requirement | Owner |
| D-003 | 2026-10-02 | Payment gateways in scope: **eSewa, Khalti, ConnectIPS**, behind a provider abstraction with server-side verification | Owner requirement | Owner |
| D-004 | 2026-10-02 | Three surfaces: student mobile app, web Admin CMS, backend API; all academic/commercial content CMS-driven | Owner requirement | Owner |
| D-005 | 2026-10-02 | UI reference PDF is a functional reference; visual design will be redesigned to a premium, accessible design system | Owner requirement | Owner |
| D-006 | 2026-10-02 | GitHub `origin` is the primary remote; conventional commits; no force-push or secret commits | Owner requirement | Owner |

## Pending (see OPEN_QUESTIONS.md)
- Exam scope, academic hierarchy, business model, pricing/validity, platforms, language, exam rules, hosting, full tech stack.
