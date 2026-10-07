import { expect, test } from '@playwright/test';
import { apiCall, editorToken } from './helpers';

/**
 * Phase 12c part 2: articles on the website (D-063) — free to read, found by search engines: the home page's latest
 * articles, the list by kind, the article page with its source link (D-018) and structured data, and the sitemap.
 */
const run = Date.now().toString(36);
const slug = `gorkhapatra-${run}`;
const title = `Gorkhapatra ${run}: new PSC calendar`;

test.beforeAll(async ({ request }) => {
  const token = await editorToken(request);
  const doc = (text: string) => ({
    en: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
  });
  const created = await apiCall(request, token, 'POST', '/admin/articles', {
    kind: 'gorkhapatra',
    slug,
    title: { en: title, ne: `गोरखापत्र ${run}: लोक सेवाको नयाँ क्यालेन्डर` },
    summary: { en: 'The Public Service Commission published its calendar for next year.' },
    body: doc('The calendar lists 120 posts with their exam dates.'),
    coverMediaId: null,
    categoryId: null,
    period: null,
    periodDate: '2026-10-07',
    sourceName: 'Gorkhapatra',
    sourceUrl: 'https://gorkhapatraonline.com/epaper',
    quizAssessmentId: null,
    isFeatured: false,
    notify: false,
  });
  await apiCall(request, token, 'PUT', `/admin/articles/${created.id}/status`, { status: 'published' });
});

test('home → articles → a Gorkhapatra summary with its source; the index is in the sitemap', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Latest articles' })).toBeVisible();
  await page.getByRole('link', { name: 'All articles' }).click();
  await expect(page.getByRole('heading', { name: 'Articles', level: 1 })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Kinds of article' })
    .getByRole('link', { name: 'Gorkhapatra' })
    .click();
  await expect(page).toHaveURL(/\/articles\?kind=gorkhapatra$/);
  const card = page.getByRole('link', { name: new RegExp(title) });
  await expect(card).toContainText('The Public Service Commission published its calendar for next year.');
  await expect(card).toContainText('21 Asoj 2083');
  await card.click();

  await expect(page).toHaveURL(new RegExp(`/articles/${slug}$`));
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await expect(page.getByText('The calendar lists 120 posts with their exam dates.')).toBeVisible();
  const source = page.getByRole('link', { name: 'Gorkhapatra', exact: true }).last();
  await expect(source).toHaveAttribute('href', 'https://gorkhapatraonline.com/epaper');
  await expect(source).toHaveAttribute('rel', /nofollow/);
  await expect(page).toHaveTitle(new RegExp(title));
  const jsonLd = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}');
  expect(jsonLd).toMatchObject({ '@type': 'NewsArticle', headline: title });

  const sitemap = await request.get('/sitemap.xml');
  // Built ahead and refreshed hourly, so this run's article is not in it yet; the articles index is.
  expect(await sitemap.text()).toMatch(/<loc>[^<]*\/articles<\/loc>/);
});

test('an unknown article address is a "not found" page', async ({ page }) => {
  const res = await page.goto(`/articles/no-such-${run}`);
  expect(res?.status()).toBe(404);
});
