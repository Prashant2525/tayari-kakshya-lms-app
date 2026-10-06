// Ports and URLs of the website E2E run (no Node-only code: imported by the Playwright config and specs).
export const E2E_API_PORT = 4040;
export const E2E_API_ORIGIN = `http://localhost:${E2E_API_PORT}`;
export const E2E_WEB_PORT = 3091;
export const E2E_WEB_ORIGIN = `http://localhost:${E2E_WEB_PORT}`;
/** Mailpit captures the verification and reset codes the API emails (dev compose / CI service). */
export const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';
