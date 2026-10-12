// Seeded E2E staff accounts (test-only). Separate from env.mjs so test files can import it without Node-only code.
export const E2E_ADMIN_EMAIL = 'e2e-admin@example.test';
export const E2E_ADMIN_PASSWORD = 'e2e only password';
/** Content-team staff (not a Super Admin) used by the content specs; same password. */
export const E2E_EDITOR_EMAIL = 'e2e-editor@example.test';
/**
 * A second content-team account with the same permissions. Staff sign-in allows 5 attempts per account per 15
 * minutes (a security limit, not loosened for tests), so specs beyond that budget sign in with this one.
 */
export const E2E_EDITOR2_EMAIL = 'e2e-editor-2@example.test';
/** A third one, for the same reason. */
export const E2E_EDITOR3_EMAIL = 'e2e-editor-3@example.test';
/**
 * A student made by the seed (same password), for specs that need one but not the sign-up itself: sign-up allows 10
 * accounts per IP per hour, and a whole suite runs from one IP.
 */
export const E2E_STUDENT_EMAIL = 'e2e-student@example.test';
/** A second seeded student, for specs that count a student's own activity exactly (progress analytics). */
export const E2E_STUDENT2_EMAIL = 'e2e-student-2@example.test';
/** A third one (study planner). */
export const E2E_STUDENT3_EMAIL = 'e2e-student-3@example.test';
/** A fourth one (live classes). */
export const E2E_STUDENT4_EMAIL = 'e2e-student-4@example.test';
