// Ports and URLs of the student-app E2E run (no Node-only code: imported by the Playwright config and specs).
export const E2E_API_PORT = 4020;
export const E2E_WEB_PORT = 8091;
export const E2E_WEB_ORIGIN = `http://localhost:${E2E_WEB_PORT}`;
/** Mailpit captures the verification and reset codes the API emails (dev compose / CI service). */
export const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';
/**
 * The web build used by browser tests sends analytics to this fake host (never the real PostHog project, even when
 * apps/mobile/.env holds the real key); specs intercept it to check what would be sent.
 */
export const E2E_POSTHOG_KEY = 'phc_e2e_test_key';
export const E2E_POSTHOG_HOST = 'https://posthog.e2e.invalid';
