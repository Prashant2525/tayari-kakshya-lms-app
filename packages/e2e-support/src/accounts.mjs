// Seeded E2E staff accounts (test-only). Separate from env.mjs so test files can import it without Node-only code.
export const E2E_ADMIN_EMAIL = 'e2e-admin@example.test';
export const E2E_ADMIN_PASSWORD = 'e2e only password';
/** Content-team staff (not a Super Admin) used by the content specs; same password. */
export const E2E_EDITOR_EMAIL = 'e2e-editor@example.test';
