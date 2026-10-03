// Ports and URLs of the student-app E2E run (no Node-only code: imported by the Playwright config and specs).
export const E2E_API_PORT = 4020;
export const E2E_WEB_PORT = 8091;
export const E2E_WEB_ORIGIN = `http://localhost:${E2E_WEB_PORT}`;
/** Mailpit captures the verification and reset codes the API emails (dev compose / CI service). */
export const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';
