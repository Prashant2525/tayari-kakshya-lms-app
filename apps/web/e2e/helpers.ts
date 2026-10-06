import { expect, type APIRequestContext } from '@playwright/test';
import { E2E_ADMIN_PASSWORD, E2E_EDITOR_EMAIL } from '@tk/e2e-support/accounts';
import { E2E_API_ORIGIN, MAILPIT_URL } from './constants.mjs';

const api = (path: string) => `${E2E_API_ORIGIN}/api/v1${path}`;

/** Signs in the seeded content editor through the admin API (no browser) and returns an access token. */
export async function editorToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(api('/admin/auth/login'), {
    headers: { 'X-TK-Client': 'admin' },
    data: { email: E2E_EDITOR_EMAIL, password: E2E_ADMIN_PASSWORD },
  });
  expect(res.ok(), await res.text()).toBe(true);
  return ((await res.json()) as { accessToken: string }).accessToken;
}

/** JSON call to the API as staff; fails the test on any non-2xx response. */
export async function apiCall<T = { id: string }>(
  request: APIRequestContext,
  token: string,
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  data?: unknown,
): Promise<T> {
  const res = await request.fetch(api(path), {
    method,
    headers: { Authorization: `Bearer ${token}`, 'X-TK-Client': 'admin' },
    ...(data === undefined ? {} : { data }),
  });
  expect(res.ok(), `${method} ${path}: ${await res.text()}`).toBe(true);
  return (res.status() === 204 ? null : await res.json()) as T;
}

/** Waits for the newest email to `to` received after `since` and returns the 6-digit code in it. */
export async function codeFromEmail(request: APIRequestContext, to: string, since: Date): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const search = await request.get(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
    );
    if (search.ok()) {
      const { messages } = (await search.json()) as { messages: Array<{ ID: string; Created: string }> };
      const fresh = messages
        .filter((m) => Date.parse(m.Created) >= since.getTime() - 1000)
        .sort((a, b) => Date.parse(b.Created) - Date.parse(a.Created))[0];
      if (fresh) {
        const message = (await (await request.get(`${MAILPIT_URL}/api/v1/message/${fresh.ID}`)).json()) as {
          Text: string;
        };
        const code = /\b(\d{6})\b/.exec(message.Text)?.[1];
        if (code) return code;
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No code emailed to ${to} (is Mailpit running at ${MAILPIT_URL}?)`);
}
