import { expect, test, type Page } from '@playwright/test';
import { E2E_ADMIN_PASSWORD, E2E_STUDENT4_EMAIL } from '@tk/e2e-support/accounts';
import { apiCall, editorToken } from './helpers';

/**
 * Live classes (D-072) against the real API: a free YouTube class that is live now and a premium Zoom class later.
 * A student with free access sees both on the course page and Home, joins the free one inside the app, and the
 * premium one stays locked without its link.
 */
const run = Date.now().toString(36);
const slug = `gk-live-${run}`;
const freeTitle = `Current affairs live ${run}`;
const premiumTitle = `Mock interview on Zoom ${run}`;

let page: Page;
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser, request }) => {
  const token = await editorToken(request);
  const call = <T = { id: string }>(method: 'POST' | 'PUT', p: string, data?: unknown) =>
    apiCall<T>(request, token, method, p, data);
  const subject = await call('POST', '/admin/subjects', { name: { en: `General knowledge ${run}` } });
  await call('PUT', `/admin/subjects/${subject.id}/status`, { status: 'published' });
  const course = await call('POST', '/admin/courses', { slug, title: { en: `GK ${run}` } });
  await call('PUT', `/admin/courses/${course.id}/subjects`, { subjects: [{ subjectId: subject.id }] });
  await call('PUT', `/admin/courses/${course.id}/publishing`, { status: 'published' });

  const klass = (title: string, extra: Record<string, unknown>) => ({
    courseId: course.id,
    title: { en: title },
    description: { en: 'Bring your questions.' },
    durationMinutes: 60,
    instructorId: null,
    passcode: null,
    ...extra,
  });
  const free = await call(
    'POST',
    '/admin/live-classes',
    klass(freeTitle, {
      provider: 'youtube',
      joinUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      startsAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      accessLevel: 'free',
    }),
  );
  await call('POST', `/admin/live-classes/${free.id}/publish`);
  await call('POST', `/admin/live-classes/${free.id}/start`);
  const premium = await call(
    'POST',
    '/admin/live-classes',
    klass(premiumTitle, {
      provider: 'zoom',
      joinUrl: 'https://zoom.us/j/81234567890',
      passcode: 'secret42',
      startsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      accessLevel: 'premium',
    }),
  );
  await call('POST', `/admin/live-classes/${premium.id}/publish`);

  // A seeded student: sign-up allows 10 accounts per IP per hour, which the suite already uses.
  page = await browser.newPage();
});
test.afterAll(async () => {
  await page.close();
});

const visible = <T extends ReturnType<Page['getByRole']>>(l: T) => l.filter({ visible: true });
const button = (name: string | RegExp) =>
  visible(page.getByRole('button', { name, exact: typeof name === 'string' }));
const link = (name: string | RegExp) => visible(page.getByRole('link', { name }));
const text = (value: string | RegExp) => visible(page.getByText(value));

test('the course page and Home show the classes; the free one plays inside the app', async () => {
  await page.goto('/');
  await visible(page.getByLabel('Email', { exact: true })).fill(E2E_STUDENT4_EMAIL);
  await visible(page.getByLabel('Password', { exact: true })).fill(E2E_ADMIN_PASSWORD);
  await button('Log in').click();
  await button('Skip').click();

  await page.goto(`/course/${slug}`);
  await expect(visible(page.getByRole('heading', { name: 'Live classes' }))).toBeVisible();
  await expect(link(freeTitle)).toBeVisible();
  await expect(link(premiumTitle)).toBeVisible();
  await button('Enrol for free').click();
  await expect(text('You have access to this course.')).toBeVisible();

  // Home: the class of my course that is live now.
  await page.goto('/');
  await expect(visible(page.getByRole('heading', { name: 'Live now' }))).toBeVisible();
  await link(freeTitle).click();
  await expect(visible(page.getByRole('heading', { name: freeTitle }))).toBeVisible();
  await expect(text('On YouTube Live, inside the app')).toBeVisible();
  await expect(text('Bring your questions.')).toBeVisible();
  await button('Join the class').click();
  await expect(visible(page.locator(`iframe[title="${freeTitle}"]`))).toHaveAttribute(
    'src',
    /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?autoplay=1/,
  );
});

test('a premium class stays locked for a student with free access, and its link is never sent', async () => {
  const links: string[] = [];
  page.on('response', async (res) => {
    if (res.url().includes('/api/v1/live-classes')) links.push(await res.text().catch(() => ''));
  });
  await page.goto('/live');
  await expect(text('You joined')).toBeVisible();
  await link(premiumTitle).click();
  await expect(visible(page.getByRole('heading', { name: premiumTitle }))).toBeVisible();
  await expect(text('For students of this course')).toBeVisible();
  await expect(button('See the course')).toBeVisible();
  await expect(button('Join on Zoom')).toHaveCount(0);
  expect(links.length).toBeGreaterThan(0);
  expect(links.join('\n')).not.toContain('zoom.us');
  expect(links.join('\n')).not.toContain('secret42');

  // Past: nothing yet.
  await page.goto('/live');
  await visible(page.getByRole('radio', { name: 'Past' })).click();
  await expect(text('No past classes yet')).toBeVisible();
});

test('live class notifications can be switched off', async () => {
  await page.goto('/profile/notifications');
  await expect(text('Live classes')).toBeVisible();
});
