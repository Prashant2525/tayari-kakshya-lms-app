import { expect, test } from '@playwright/test';
import { pngFixture } from '@tk/e2e-support/png';
import { E2E_API_ORIGIN } from './constants.mjs';
import { apiCall, editorToken } from './helpers';

/** Phase 12d: Help & support and the static pages on the website (D-034, D-038, D-064). */
const run = Date.now().toString(36);
const doc = (text: string) => ({
  en: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
});

test.beforeAll(async ({ request }) => {
  const token = await editorToken(request);
  await apiCall(request, token, 'POST', '/admin/contact-options', {
    type: 'whatsapp',
    label: { en: `WhatsApp ${run}` },
    value: '+977 9800000000',
    note: null,
    sortOrder: 0,
    active: true,
  });
  await apiCall(request, token, 'POST', '/admin/faqs', {
    question: { en: `Where do I buy a course? ${run}` },
    answer: { en: 'On this website: open the course and choose Buy.' },
    sortOrder: 0,
    active: true,
    hideOnIos: true,
  });
  for (const [slug, title, text] of [
    ['about', 'About us', `We help Lok Sewa candidates ${run}.`],
    ['terms', 'Terms of use', `Use the service fairly ${run}.`],
  ] as const) {
    await apiCall(request, token, 'PUT', `/admin/pages/${slug}`, { title: { en: title }, body: doc(text) });
    await apiCall(request, token, 'POST', `/admin/pages/${slug}/publish`);
  }
});

test('Help & support, the footer pages, and Terms at sign-up', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  const footer = page.getByRole('navigation', { name: 'Site' });
  await footer.getByRole('link', { name: 'Help & support' }).click();
  await expect(page.getByRole('heading', { name: 'Help & support', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: '+977 9800000000' })).toHaveAttribute(
    'href',
    'https://wa.me/9779800000000',
  );
  // An FAQ hidden in the iPhone app is still on the website.
  await page.getByText(`Where do I buy a course? ${run}`).click();
  await expect(page.getByText('On this website: open the course and choose Buy.')).toBeVisible();

  // Footer and sign-up links refresh within a minute of publishing (an earlier spec may have loaded them).
  await expect(async () => {
    await page.goto('/help');
    await page
      .getByRole('navigation', { name: 'Site' })
      .getByRole('link', { name: 'About us' })
      .click({ timeout: 2000 });
    await expect(page).toHaveURL(/\/about$/, { timeout: 2000 });
  }).toPass({ timeout: 90_000 });
  await expect(page.getByRole('heading', { name: 'About us', level: 1 })).toBeVisible();
  await expect(page.getByText(`We help Lok Sewa candidates ${run}.`)).toBeVisible();
  // Not published yet: not found.
  expect((await page.goto('/privacy'))?.status()).toBe(404);

  await expect(async () => {
    await page.goto('/register');
    await expect(page.locator('form').getByRole('link', { name: 'Terms of use' })).toHaveAttribute(
      'href',
      '/terms',
      {
        timeout: 2000,
      },
    );
  }).toPass({ timeout: 90_000 });
  await page.goto('/terms');
  await expect(page.getByText(`Use the service fairly ${run}.`)).toBeVisible();
});

test('a banner on the home page links to its page', async ({ page, request }) => {
  test.setTimeout(180_000);
  const token = await editorToken(request);
  const upload = await request.post(`${E2E_API_ORIGIN}/api/v1/admin/media`, {
    headers: { Authorization: `Bearer ${token}`, 'X-TK-Client': 'admin' },
    multipart: {
      visibility: 'public',
      file: { name: 'banner.png', mimeType: 'image/png', buffer: pngFixture() },
    },
  });
  expect(upload.ok(), await upload.text()).toBe(true);
  await apiCall(request, token, 'POST', '/admin/banners', {
    title: { en: `About Tayari Kakshya ${run}` },
    imageMediaId: ((await upload.json()) as { id: string }).id,
    linkType: 'page',
    linkValue: 'about',
    placement: 'website',
    startsAt: null,
    endsAt: null,
    sortOrder: 0,
    active: true,
    hideOnIos: false,
  });
  // The home page refreshes its banners every minute.
  await expect(async () => {
    await page.goto('/');
    await page.getByRole('img', { name: `About Tayari Kakshya ${run}` }).click({ timeout: 2000 });
    await expect(page).toHaveURL(/\/about$/, { timeout: 2000 });
  }).toPass({ timeout: 90_000 });
});
