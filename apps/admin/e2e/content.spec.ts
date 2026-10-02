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

/** The row of one learning item in the subject outline (rows are nested inside topic and chapter lists). */
const itemRow = (page: Page, title: string) =>
  page.getByRole('link', { name: title, exact: true }).locator('xpath=ancestor::li[1]');

test.describe.configure({ mode: 'serial' });

// One sign-in for the whole file: staff sign-in is rate limited per account (5 per 15 minutes).
let page: Page;
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await signInAsEditor(page);
});
test.afterAll(async () => {
  await page.close();
});

test('the content team sees content sections and not staff administration', async () => {
  const nav = page.getByRole('navigation', { name: 'Main' });
  for (const name of ['Exam categories', 'Papers', 'Media library', 'Students']) {
    await expect(nav.getByRole('link', { name })).toBeVisible();
  }
  for (const name of ['Staff', 'Roles & permissions', 'System settings']) {
    await expect(nav.getByRole('link', { name })).toHaveCount(0);
  }
});

test('media library: images are optimised, PDFs are private, descriptions are saved', async () => {
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

test('exam categories: build authority → post, enforce hierarchy, publish', async () => {
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

test('papers: validates marks and links posts', async () => {
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

test('subjects: chapter → topic → bilingual note with formatting and an image, then publish', async ({
  page,
}) => {
  await signInAsEditor(page);
  await page.getByRole('link', { name: 'Subjects' }).click();
  await page.getByRole('button', { name: 'Add subject' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name (English)').fill('General Knowledge');
  await dialog.getByLabel('नाम (नेपाली)').fill('सामान्य ज्ञान');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'General Knowledge' })).toBeVisible();

  await page.getByRole('button', { name: 'Add the first chapter' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Number').fill('1');
  await dialog.getByLabel('Title (English)').fill('Constitution of Nepal');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Chapter added')).toBeVisible();

  await page.getByRole('button', { name: 'Add a topic' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Number').fill('1.1');
  await dialog.getByLabel('Title (English)').fill('Fundamental Rights');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Topic added')).toBeVisible();

  await page.getByRole('button', { name: 'Note', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'New note' })).toBeVisible();
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.getByText('Enter the title in English, Nepali or both')).toBeVisible();
  await expect(page.getByText('Write the note in English, Nepali or both')).toBeVisible();

  await page.getByLabel('Title (English)').fill('Right to equality');
  const editor = page.getByRole('textbox', { name: 'Note (English)' });
  await editor.click();
  await page.keyboard.type('Article 18 guarantees ');
  await page.getByRole('button', { name: 'Bold' }).click();
  await page.keyboard.type('equality before law');
  await page.getByRole('button', { name: 'Bold' }).click();
  await page.keyboard.type('.');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Insert image' }).click();
  await page
    .getByRole('dialog', { name: 'Insert an image' })
    .getByRole('button', { name: /police-emblem\.png/ })
    .click();
  await expect(editor.locator('img')).toBeVisible();
  await expect(editor.locator('strong')).toHaveText('equality before law');

  await page.getByRole('tab', { name: /नेपाली/ }).click();
  await page.getByRole('textbox', { name: 'नोट (नेपाली)' }).click();
  await page.keyboard.type('धारा १८ ले समानताको हक सुनिश्चित गर्छ।');

  // Leaving with unsaved changes asks first; dismissing keeps the work.
  page.once('dialog', (d) => void d.dismiss());
  await page.getByRole('link', { name: 'Back to subject' }).click();
  await expect(page.getByRole('heading', { name: 'New note' })).toBeVisible();

  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.getByText('Note created as a draft')).toBeVisible();
  await expect(page).toHaveURL(/\/learning-items\//);
  await expect(page.getByRole('heading', { name: 'Right to equality' })).toBeVisible();

  // Content survives a reload exactly as written, in both languages.
  await page.reload();
  const reloaded = page.getByRole('textbox', { name: 'Note (English)' });
  await expect(reloaded).toContainText('Article 18 guarantees equality before law.');
  await expect(reloaded.locator('strong')).toHaveText('equality before law');
  await expect(reloaded.locator('img')).toBeVisible();
  await page.getByRole('tab', { name: /नेपाली/ }).click();
  await expect(page.getByRole('textbox', { name: 'नोट (नेपाली)' })).toContainText('समानताको हक');

  await page.getByLabel('Status', { exact: true }).selectOption('published');
  await page.getByRole('button', { name: 'Update status' }).click();
  await expect(page.getByText('Status: Published')).toBeVisible();

  await page.getByRole('link', { name: 'Back to subject' }).click();
  const row = itemRow(page, 'Right to equality');
  await expect(row).toContainText('Premium');
  await expect(row).toContainText('Published');
});

test('video and PDF items: provider checks, YouTube warning, scheduling', async () => {
  await page.getByRole('link', { name: 'Subjects' }).click();
  await page.getByRole('link', { name: /General Knowledge/ }).click();

  await page.getByRole('button', { name: 'Actions for topic Fundamental Rights' }).click();
  await page.getByRole('menuitem', { name: 'Add video' }).click();
  await page.getByLabel('Title (English)').fill('Lecture: Fundamental Rights');
  // Premium + YouTube is allowed but flagged.
  await expect(page.getByText('YouTube videos are not protected')).toBeVisible();
  await page.getByLabel('Bunny Stream (protected)').check();
  await page.getByLabel('Bunny video ID').fill('57c686b8-da4f-404c-920e-2f8d34d166dc');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Bunny Stream is not configured yet' }),
  ).toBeVisible();

  await page.getByLabel('YouTube (unlisted)').check();
  await page.getByLabel('YouTube link').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.getByLabel('Who can open it').selectOption('free');
  await expect(page.getByText('YouTube videos are not protected')).toHaveCount(0);
  await page.getByLabel('Duration').fill('12:61');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.getByText('Use minutes:seconds, e.g. 12:30')).toBeVisible();
  await page.getByLabel('Duration').fill('12:30');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.getByText('Video created as a draft')).toBeVisible();
  await expect(page.getByText('Linked: YouTube dQw4w9WgXcQ')).toBeVisible();

  await page.getByRole('link', { name: 'Back to subject' }).click();
  await page.getByRole('button', { name: 'Actions for topic Fundamental Rights' }).click();
  await page.getByRole('menuitem', { name: 'Add pdf' }).click();
  await page.getByLabel('Title (English)').fill('Constitution (full text)');
  await page.getByRole('button', { name: 'Choose' }).click();
  await page
    .getByRole('dialog', { name: 'Choose a PDF' })
    .getByRole('button', { name: /syllabus\.pdf/ })
    .click();
  await page.getByLabel('Allow download').click();
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.getByText('PDF created as a draft')).toBeVisible();

  await page.getByLabel('Status', { exact: true }).selectOption('scheduled');
  await page.getByRole('button', { name: 'Update status' }).click();
  await expect(page.getByText('Choose the date and time to publish')).toBeVisible();
  await page.getByLabel('Publish at (Nepal time)').fill('2030-01-15T09:00');
  await page.getByRole('button', { name: 'Update status' }).click();
  await expect(page.getByText('Status: Scheduled')).toBeVisible();
  await expect(page.getByText(/Scheduled · .*, 09:00/)).toBeVisible();

  await page.getByRole('link', { name: 'Back to subject' }).click();
  for (const title of ['Right to equality', 'Lecture: Fundamental Rights', 'Constitution (full text)']) {
    await expect(page.getByRole('link', { name: title })).toBeVisible();
  }
  const video = itemRow(page, 'Lecture: Fundamental Rights');
  await expect(video).toContainText('12:30');
  await expect(video).toContainText('Free');
});
