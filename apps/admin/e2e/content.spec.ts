import { expect, test, type Page } from '@playwright/test';
import { E2E_ADMIN_PASSWORD, E2E_EDITOR_EMAIL } from './e2e-env.mjs';
import { pdfFixture, pngFixture } from './fixtures';

/** Content-team staff member (not a Super Admin), so no two-factor step. */
async function signInAsEditor(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(E2E_EDITOR_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(E2E_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('link', { name: 'Exam categories' })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test('the content team sees content sections and not staff administration', async ({ page }) => {
  await signInAsEditor(page);
  const nav = page.getByRole('navigation', { name: 'Main' });
  for (const name of ['Exam categories', 'Papers', 'Media library', 'Students']) {
    await expect(nav.getByRole('link', { name })).toBeVisible();
  }
  for (const name of ['Staff', 'Roles & permissions', 'System settings']) {
    await expect(nav.getByRole('link', { name })).toHaveCount(0);
  }
});

test('media library: images are optimised, PDFs are private, descriptions are saved', async ({ page }) => {
  await signInAsEditor(page);
  await page.getByRole('link', { name: 'Media library' }).click();
  await expect(page.getByText('The media library is empty')).toBeVisible();

  await page.getByLabel('Upload files').setInputFiles([
    { name: 'police-emblem.png', mimeType: 'image/png', buffer: pngFixture() },
    { name: 'syllabus.pdf', mimeType: 'application/pdf', buffer: pdfFixture() },
  ]);
  await expect(page.getByText('2 files uploaded')).toBeVisible();
  const pdfCard = page.getByRole('button', { name: /syllabus\.pdf/ });
  await expect(pdfCard).toContainText('Private');
  const imageCard = page.getByRole('button', { name: /police-emblem\.png/ });
  await expect(imageCard).not.toContainText('Private');
  await expect(imageCard.locator('img')).toHaveJSProperty('complete', true);
  expect(
    await imageCard.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth),
  ).toBeGreaterThan(0);

  await imageCard.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Image (WebP)')).toBeVisible();
  await expect(dialog.getByText('800 × 400')).toBeVisible();
  await dialog.getByLabel('Description (English)').fill('Nepal Police emblem');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Description saved')).toBeVisible();
  await imageCard.click();
  await expect(page.getByRole('dialog').getByLabel('Description (English)')).toHaveValue(
    'Nepal Police emblem',
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).first().click();

  await page.getByLabel('File type').selectOption('pdf');
  await expect(page.getByRole('button', { name: /police-emblem\.png/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /syllabus\.pdf/ })).toBeVisible();
});

test('exam categories: build authority → post, enforce hierarchy, publish', async ({ page }) => {
  await signInAsEditor(page);
  await page.getByRole('link', { name: 'Exam categories' }).click();
  await page.getByRole('button', { name: 'Add the first authority' }).click();

  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name (English)').fill('Nepal Police');
  await dialog.getByLabel('नाम (नेपाली)').fill('नेपाल प्रहरी');
  await expect(dialog.getByLabel('URL name')).toHaveValue('nepal-police');
  await dialog.getByRole('button', { name: 'Choose' }).click();
  await page
    .getByRole('dialog', { name: 'Choose an image' })
    .getByRole('button', { name: /police-emblem\.png/ })
    .click();
  await expect(dialog.getByText('police-emblem.png')).toBeVisible();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Category added')).toBeVisible();

  await page.getByRole('button', { name: 'Actions for Nepal Police' }).click();
  await page.getByRole('menuitem', { name: 'Add inside' }).click();
  dialog = page.getByRole('dialog');
  // A post can sit directly under an authority; an authority cannot be nested.
  await expect(dialog.getByLabel('Type').locator('option')).toHaveText(['Level', 'Service', 'Group', 'Post']);
  await dialog.getByLabel('Type').selectOption('post');
  await dialog.getByLabel('Name (English)').fill('Constable');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Category added')).toBeVisible();
  await expect(page.getByText('Post · /constable')).toBeVisible();

  for (const name of ['Nepal Police', 'Constable']) {
    await page.getByRole('button', { name: `Actions for ${name}` }).click();
    await page.getByRole('menuitem', { name: 'Publish' }).click();
    await expect(page.getByText('Published', { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText('Published', { exact: true })).toHaveCount(2);

  // Deleting a category that still has children is refused, with the reason shown.
  await page.getByRole('button', { name: 'Actions for Nepal Police' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Move or delete the items inside');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Actions for Nepal Police' })).toBeVisible();
  await expect(page.getByText('Authority · /nepal-police')).toBeVisible();
});

test('papers: validates marks and links posts', async ({ page }) => {
  await signInAsEditor(page);
  await page.getByRole('link', { name: 'Papers' }).click();
  await page.getByRole('button', { name: 'Add paper' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name (English)').fill('Paper I: General Awareness');
  await dialog.getByLabel('Full marks').fill('50');
  await dialog.getByLabel('Pass marks').fill('60');
  await dialog.getByLabel('Minutes').fill('45');
  await dialog.getByLabel('Constable').check();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByText('Pass marks cannot exceed full marks')).toBeVisible();
  await dialog.getByLabel('Pass marks').fill('20');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Paper added')).toBeVisible();

  const row = page.getByRole('row', { name: /Paper I: General Awareness/ });
  await expect(row).toContainText('50 / pass 20');
  await expect(row).toContainText('45 min');
  await expect(row).toContainText('Constable');
  await row.getByLabel(/Status of/).selectOption('published');
  await expect(page.getByText('Status updated')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('row', { name: /Paper I/ }).getByLabel(/Status of/)).toHaveValue('published');
});
