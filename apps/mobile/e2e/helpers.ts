import { expect, type APIRequestContext } from '@playwright/test';
import { E2E_ADMIN_PASSWORD, E2E_EDITOR_EMAIL } from '@tk/e2e-support/accounts';
import { E2E_WEB_ORIGIN, MAILPIT_URL } from './constants.mjs';

const api = (path: string) => `${E2E_WEB_ORIGIN}/api/v1${path}`;

let cachedEditorToken: { token: string; at: number } | null = null;

/**
 * Signs in the seeded content editor through the admin API (no browser) and returns an access token. The token is
 * reused for 5 minutes: staff sign-in allows 5 attempts per account per 15 minutes, fewer than the specs that need it.
 */
export async function editorToken(request: APIRequestContext): Promise<string> {
  if (cachedEditorToken && Date.now() - cachedEditorToken.at < 5 * 60_000) return cachedEditorToken.token;
  const res = await request.post(api('/admin/auth/login'), {
    headers: { 'X-TK-Client': 'admin' },
    data: { email: E2E_EDITOR_EMAIL, password: E2E_ADMIN_PASSWORD },
  });
  expect(res.ok(), await res.text()).toBe(true);
  const token = ((await res.json()) as { accessToken: string }).accessToken;
  cachedEditorToken = { token, at: Date.now() };
  return token;
}

/** Creates and publishes a category, as the content team would in the CMS. */
export async function publishedNode(
  request: APIRequestContext,
  token: string,
  body: { parentId: string | null; nodeType: string; name: { en: string; ne?: string }; slug: string },
): Promise<string> {
  const headers = { Authorization: `Bearer ${token}`, 'X-TK-Client': 'admin' };
  const created = await request.post(api('/admin/exam-nodes'), { headers, data: body });
  expect(created.ok(), await created.text()).toBe(true);
  const { id } = (await created.json()) as { id: string };
  const published = await request.put(api(`/admin/exam-nodes/${id}/status`), {
    headers,
    data: { status: 'published' },
  });
  expect(published.ok(), await published.text()).toBe(true);
  return id;
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

/** JSON call to the API as the given staff/student token; fails the test on any non-2xx response. */
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
  return (res.status() === 204 ? undefined : await res.json()) as T;
}

/** Uploads a private PDF to the media library (as the content team does) and returns its id. */
export async function uploadPdf(request: APIRequestContext, token: string, buffer: Buffer): Promise<string> {
  const res = await request.post(api('/admin/media'), {
    headers: { Authorization: `Bearer ${token}`, 'X-TK-Client': 'admin' },
    // Fields before the file: the API reads them from the multipart stream in order.
    multipart: { visibility: 'private', file: { name: 'lesson.pdf', mimeType: 'application/pdf', buffer } },
  });
  expect(res.ok(), await res.text()).toBe(true);
  return ((await res.json()) as { id: string }).id;
}

/** Uploads a public picture to the media library (as staff do) and returns its id. */
export async function uploadImage(
  request: APIRequestContext,
  token: string,
  buffer: Buffer,
): Promise<string> {
  const res = await request.post(api('/admin/media'), {
    headers: { Authorization: `Bearer ${token}`, 'X-TK-Client': 'admin' },
    multipart: { visibility: 'public', file: { name: 'banner.png', mimeType: 'image/png', buffer } },
  });
  expect(res.ok(), await res.text()).toBe(true);
  return ((await res.json()) as { id: string }).id;
}
