## What changes

<!-- What and why, for the owner. Link the decision (D-…) or task (T-…). -->

## Checks

- [ ] `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` pass; browser tests for changed screens
- [ ] UI changes checked in a real browser (screenshots)
- [ ] Docs updated: `PROJECT_STATE.md`, `SESSION_HANDOFF.md`, `IMPLEMENTATION_PLAN.md` (+ `TEST_STATUS.md`, `CHANGELOG.md`, `KNOWN_ISSUES.md` when relevant)

## Configuration (D-076 — zero code changes for configuration)

- [ ] No configuration change in this PR, **or** every added / renamed / removed variable, service, callback address
      or deployment step is in `docs/ENVIRONMENT_AND_PRODUCTION_DEPLOYMENT_GUIDE.md` (section + change log), the
      matching `.env.example`, `ENVIRONMENT_REQUIREMENTS.md` / `ENVIRONMENT_STATUS.md`, start-up validation and
      `config-check`
- [ ] No secret in code, docs, logs or client bundles (the app reads only `EXPO_PUBLIC_*`, the CMS only `VITE_*`)
- [ ] Sandbox and production both work by configuration alone; production refuses test / sandbox values
