import { expect, test } from '@playwright/test';
import { gunzipSync } from 'node:zlib';
import { E2E_POSTHOG_HOST, E2E_WEB_ORIGIN } from './constants.mjs';
import { apiCall } from './helpers';

/**
 * Product analytics privacy (D-039, ARCHITECTURE §Observability): the test build sends analytics to a fake host,
 * which this spec intercepts. Events must identify the student only by the API's pseudonym and must never contain
 * the name, email, account id or search text.
 */
const run = Date.now().toString(36);
const fullName = `Sita Analytics ${run}`;
const email = `analytics.${run}@example.com`;
const password = 'analytics every day';
const searchText = `zz-private-search-${run}`;

interface CapturedEvent {
  event: string;
  distinct_id?: string;
  properties?: Record<string, unknown>;
}

test('analytics: pseudonymous identity, route-pattern screens, no personal data', async ({
  page,
  request,
}) => {
  const bodies: string[] = [];
  await page.route(`${E2E_POSTHOG_HOST}/**`, async (route) => {
    const raw = route.request().postDataBuffer();
    if (raw?.length) {
      const gzipped = raw[0] === 0x1f && raw[1] === 0x8b;
      bodies.push((gzipped ? gunzipSync(raw) : raw).toString('utf8'));
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":1}' });
  });

  const registered = await request.post(`${E2E_WEB_ORIGIN}/api/v1/auth/register`, {
    data: {
      fullName,
      email,
      password,
      acceptTerms: true,
      device: { deviceId: `e2e-analytics-${run}`, deviceName: 'E2E', platform: 'web' },
    },
  });
  expect(registered.ok(), await registered.text()).toBe(true);
  const token = ((await registered.json()) as { accessToken: string }).accessToken;
  const me = await apiCall<{ id: string; analyticsId: string }>(request, token, 'GET', '/me');

  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).filter({ visible: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).filter({ visible: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).filter({ visible: true }).click();
  await page.getByRole('button', { name: 'Skip', exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole('heading', { name: /^Namaste/ }).filter({ visible: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Search courses, lessons, questions' })
    .filter({ visible: true })
    .click();
  await page.getByLabel('Search', { exact: true }).filter({ visible: true }).fill(searchText);
  await expect(page.getByText(/Nothing found/).filter({ visible: true })).toBeVisible();

  // The SDK sends in batches (every 10 s by default).
  const events = () =>
    bodies.flatMap((body) => {
      const parsed = JSON.parse(body) as { batch?: CapturedEvent[] } | CapturedEvent;
      return 'batch' in parsed && parsed.batch ? parsed.batch : [parsed as CapturedEvent];
    });
  await expect
    .poll(() => events().map((e) => e.event), { timeout: 30_000 })
    .toEqual(expect.arrayContaining(['logged_in', '$identify', '$screen', 'search_performed']));

  const all = events();
  expect(all.find((e) => e.event === 'logged_in')?.properties).toMatchObject({ method: 'password' });
  expect(all.find((e) => e.event === '$identify')?.distinct_id).toBe(me.analyticsId);
  expect(all.find((e) => e.event === 'search_performed')?.properties).toMatchObject({ results: 0 });
  const screens = all.filter((e) => e.event === '$screen').map((e) => e.properties?.['$screen_name']);
  expect(screens).toEqual(expect.arrayContaining(['/login', '/onboarding', '/', '/search']));

  const payload = bodies.join('\n');
  // URL-like properties (e.g. the deep link that opened the app) are removed before sending.
  for (const event of all) {
    for (const name of ['url', '$current_url', '$referrer'])
      expect(event.properties ?? {}).not.toHaveProperty(name);
  }
  for (const personal of [fullName, email, me.id, searchText, password]) {
    expect(payload, personal).not.toContain(personal);
  }
});
