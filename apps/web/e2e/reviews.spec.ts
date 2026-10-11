import { expect, test } from '@playwright/test';
import { E2E_ADMIN_PASSWORD, E2E_EDITOR2_EMAIL, E2E_STUDENT_EMAIL } from '@tk/e2e-support/accounts';
import { E2E_API_ORIGIN } from './constants.mjs';
import { apiCall, editorToken } from './helpers';

/** Phase 13c: approved course reviews and the rating on the website's course page (D-066). */
const run = Date.now().toString(36);
const slug = `reviewed-${run}`;
const reviewText = `Clear notes and good tests ${run}`;
const api = (path: string) => `${E2E_API_ORIGIN}/api/v1${path}`;

test('a course page shows its approved reviews and rating', async ({ page, request }) => {
  test.setTimeout(180_000);
  const token = await editorToken(request, E2E_EDITOR2_EMAIL);
  const call = <T = { id: string; data: Array<{ id: string }> }>(
    method: 'GET' | 'POST' | 'PUT',
    p: string,
    data?: unknown,
  ) => apiCall<T>(request, token, method, p, data);
  const subject = await call('POST', '/admin/subjects', { name: { en: `Reviewed ${run}` } });
  const chapter = await call('POST', `/admin/subjects/${subject.id}/chapters`, { title: { en: 'One' } });
  const topic = await call('POST', `/admin/chapters/${chapter.id}/topics`, { title: { en: 'One' } });
  for (const [level, id] of [
    ['subjects', subject.id],
    ['chapters', chapter.id],
    ['topics', topic.id],
  ] as const) {
    await call('PUT', `/admin/${level}/${id}/status`, { status: 'published' });
  }
  const item = await call('POST', `/admin/topics/${topic.id}/items`, {
    type: 'note',
    title: { en: 'Only lesson' },
    accessLevel: 'free',
    noteContent: {
      en: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }] },
    },
  });
  await call('PUT', `/admin/learning-items/${item.id}/publishing`, { status: 'published' });
  const course = await call('POST', '/admin/courses', { slug, title: { en: `Reviewed course ${run}` } });
  await call('PUT', `/admin/courses/${course.id}/subjects`, { subjects: [{ subjectId: subject.id }] });
  await call('PUT', `/admin/courses/${course.id}/publishing`, { status: 'published' });

  // The seeded student joins, finishes the lesson and reviews; staff approve.
  const login = await request.post(api('/auth/login'), {
    data: {
      email: E2E_STUDENT_EMAIL,
      password: E2E_ADMIN_PASSWORD,
      device: { deviceId: `e2e-web-review-${run}`, deviceName: 'E2E', platform: 'android' },
    },
  });
  expect(login.ok(), await login.text()).toBe(true);
  const student = {
    Authorization: `Bearer ${((await login.json()) as { accessToken: string }).accessToken}`,
  };
  for (const [method, path, data] of [
    ['POST', `/courses/${course.id}/enrol`, undefined],
    ['PUT', `/learning-items/${item.id}/progress`, { completed: true }],
    ['PUT', `/me/courses/${course.id}/review`, { rating: 4, body: reviewText }],
  ] as const) {
    const res = await request.fetch(api(path), { method, headers: student, ...(data ? { data } : {}) });
    expect(res.ok(), `${method} ${path}: ${await res.text()}`).toBe(true);
  }
  const pending = await call('GET', `/admin/reviews?status=pending&courseId=${course.id}`);
  await call('POST', `/admin/reviews/${pending.data[0]!.id}/approve`);

  // The page refreshes reviews every minute.
  await expect(async () => {
    await page.goto(`/courses/${slug}`);
    await expect(page.getByText(reviewText)).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 90_000 });
  await expect(page.getByRole('heading', { name: 'Reviews' })).toBeVisible();
  await expect(page.getByText('Rated 4 out of 5 from 1 review').first()).toBeAttached();
  await expect(
    page.getByText('Students who have this course can review it in the app.', { exact: false }),
  ).toBeVisible();
  // Search engines see the rating.
  const jsonLd = await page.locator('script[type="application/ld+json"]').first().textContent();
  expect(JSON.parse(jsonLd ?? '{}')).toMatchObject({
    '@type': 'Course',
    aggregateRating: { ratingValue: 4, ratingCount: 1 },
  });
});
