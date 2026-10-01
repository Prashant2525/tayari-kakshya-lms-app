# Test Status

Last updated: 2026-10-02

No application code exists yet, so there are no automated tests.

## Planned critical coverage (required before features are called complete)
| Area | Unit | Integration (API + real Postgres) | E2E |
|---|---|---|---|
| Authentication (register, login, refresh rotation/reuse, reset, Google) | ☐ | ☐ | ☐ |
| RBAC / authorization / IDOR | ☐ | ☐ | — |
| Course access & entitlements | ☐ | ☐ | ☐ |
| Payments (success, failure, cancel, duplicate callback, bad signature, amount tamper, expiry, disconnect, reconciliation) | ☐ | ☐ | ☐ |
| Enrollment & subscription expiry | ☐ | ☐ | — |
| Question evaluation & exam scoring (incl. negative marking) | ☐ | ☐ | — |
| Exam submission (timer expiry, repeat submit, reconnect, duplicate attempt) | ☐ | ☐ | ☐ |
| Admin CRUD + publish workflow + soft delete | ☐ | ☐ | ☐ |
