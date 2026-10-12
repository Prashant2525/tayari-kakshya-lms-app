import { expect, test, type Page } from '@playwright/test';
import { E2E_ADMIN_PASSWORD, E2E_EDITOR_EMAIL } from './e2e-env.mjs';

// One sign-in for the file (staff sign-in is rate limited per account).
let page: Page;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.goto('/login');
  await page.getByLabel('Email').fill(E2E_EDITOR_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(E2E_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(nav('Question bank')).toBeVisible();
});
test.afterAll(async () => {
  await page.close();
});

const nav = (name: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name });

async function newQuestion(type: string) {
  await nav('Question bank').click();
  await page.getByRole('button', { name: 'New question' }).click();
  await page.getByRole('menuitem', { name: type, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'New question' })).toBeVisible();
}

async function typeInto(label: string, text: string) {
  await page.getByRole('textbox', { name: label, exact: true }).click();
  await page.keyboard.type(text);
}

test('single choice: validation, options, correct answer, tags and a previous-year source', async () => {
  // A subject of its own so this file does not depend on the content specs.
  await nav('Subjects').click();
  await page.getByRole('button', { name: 'Add subject' }).click();
  await page.getByRole('dialog').getByLabel('Name (English)').fill('Science');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Science' })).toBeVisible();

  await newQuestion('Single choice');
  await page.getByRole('button', { name: 'Create draft' }).click();
  const problems = page.getByRole('alert').filter({ hasText: 'Please fix these before saving' });
  await expect(problems).toContainText('Subject: Choose a subject');
  await expect(problems).toContainText('Question:');

  await page.getByLabel('Subject', { exact: true }).selectOption({ label: 'Science' });
  await typeInto('Question (English)', 'What is the SI unit of force?');
  for (const [id, text] of [
    ['a', 'Joule'],
    ['b', 'Newton'],
    ['c', 'Watt'],
    ['d', 'Pascal'],
  ] as const) {
    await typeInto(`Options ${id} (English)`, text);
  }
  await page.getByLabel('Option b is correct').check();
  await page.getByRole('tab', { name: 'नेपाली' }).click();
  await typeInto('Question (नेपाली)', 'बलको SI एकाइ के हो?');
  await page.getByRole('tab', { name: 'English' }).click();
  await typeInto('Explanation (English)', '1 N = 1 kg·m/s².');
  await page.getByLabel('Marks', { exact: true }).fill('2');
  await page.getByLabel('Negative marks').fill('0.4');
  await page.getByLabel('Add a tag').fill('Physics');
  await page.keyboard.press('Enter');
  await page.getByLabel('Add a tag').fill('units');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Add source' }).click();
  await page.getByLabel('Year (BS)').fill('2079');

  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.getByText('Question created as a draft')).toBeVisible();
  await expect(page).toHaveURL(/\/questions\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Version 1 of 1')).toBeVisible();

  // Reload: everything comes back from the server.
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Question (English)', exact: true })).toContainText(
    'SI unit of force',
  );
  await expect(page.getByRole('textbox', { name: 'Options b (English)', exact: true })).toContainText(
    'Newton',
  );
  await expect(page.getByLabel('Option b is correct')).toBeChecked();
  await expect(page.getByLabel('Negative marks')).toHaveValue('0.4');
  await expect(page.getByLabel('Year (BS)')).toHaveValue('2079');
  await expect(page.getByText('Physics', { exact: true })).toBeVisible();

  // A content change creates version 2.
  await page.getByLabel('Option c is correct').check();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Saved as version 2')).toBeVisible();
  await page.getByLabel('Option b is correct').check();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Saved as version 3')).toBeVisible();

  await page.getByLabel('Question status').selectOption('published');
  await page.getByRole('button', { name: 'Update status' }).click();
  await expect(page.getByText('Status: Published')).toBeVisible();

  await nav('Question bank').click();
  const row = page.getByRole('row', { name: /SI unit of force/ });
  await expect(row).toContainText('Single choice');
  await expect(row).toContainText('PYQ');
  await expect(row).toContainText('#Physics');
  await expect(row).toContainText('Published');
  await page.getByLabel('Previous-year questions').selectOption('false');
  // Other specs add non-PYQ questions, so check this PYQ question is filtered out rather than an empty list.
  await expect(page.getByRole('row', { name: /SI unit of force/ })).toHaveCount(0);
  await page.getByLabel('Previous-year questions').selectOption('');
  await page.getByLabel('Search questions').fill('force');
  await expect(page.getByRole('row', { name: /SI unit of force/ })).toBeVisible();
});

test('fill in the blank: Insert blank adds a placeholder and its answers', async () => {
  await newQuestion('Fill in the blank');
  await page.getByLabel('Subject', { exact: true }).selectOption({ label: 'Science' });
  await typeInto('Question (English)', 'Water boils at ');
  await page.getByRole('button', { name: 'Insert blank' }).first().click();
  await page.keyboard.type(' degrees Celsius at sea level.');
  await expect(page.getByRole('textbox', { name: 'Question (English)', exact: true })).toContainText(
    '[[b1]]',
  );
  await page.getByLabel('Accepted answers for b1').fill('100\n१००');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.getByText('Question created as a draft')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Accepted answers for b1')).toHaveValue('100\n१००');
});

test('question reports: a student report is resolved by staff', async () => {
  const register = await page.request.post('/api/v1/auth/register', {
    data: {
      fullName: 'Bimal Thapa',
      email: 'bimal.e2e@example.com',
      password: 'correct horse battery',
      acceptTerms: true,
      device: { deviceId: 'e2e-device-0002', deviceName: 'E2E phone', platform: 'android' },
    },
  });
  expect(register.status()).toBe(201);
  const { accessToken } = (await register.json()) as { accessToken: string };

  await nav('Question bank').click();
  await page.getByRole('link', { name: /SI unit of force/ }).click();
  const questionId = page.url().split('/').pop() as string;
  const report = await page.request.post(`/api/v1/questions/${questionId}/reports`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { reason: 'wrong_answer', message: 'I think the answer is Joule' },
  });
  expect(report.status()).toBe(201);

  await page.reload();
  await expect(page.getByRole('link', { name: '1 open report from students' })).toBeVisible();
  await page.getByRole('link', { name: '1 open report from students' }).click();
  await expect(page.getByRole('heading', { name: 'Question reports' })).toBeVisible();
  const item = page.getByRole('listitem').filter({ hasText: 'I think the answer is Joule' });
  await expect(item).toContainText('Wrong answer');
  await expect(item).toContainText('Bimal Thapa');
  await item.getByRole('button', { name: 'Reject' }).click();
  await page.getByRole('dialog').getByLabel('Note').fill('Newton is correct: 1 N = 1 kg·m/s².');
  await page.getByRole('dialog').getByRole('button', { name: 'Reject' }).click();
  await expect(page.getByText('Report rejected')).toBeVisible();
  await expect(page.getByText('No open reports')).toBeVisible();
  await page.getByRole('tab', { name: 'rejected' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Newton is correct' })).toContainText(
    'Rejected by E2E Editor',
  );
});

test('the import template downloads with the LMS lists filled in', async () => {
  await nav('Question bank').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Import template' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('tayari-question-import-tk-questions-v1.xlsx');
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(await download.path());
  expect(wb.worksheets.map((s) => s.name)).toEqual([
    'Instructions',
    'Questions',
    'Examples',
    'Passages',
    'Lists',
  ]);
  const values: string[] = [];
  wb.getWorksheet('Lists')!.eachRow((row) => row.eachCell((c) => values.push(String(c.value))));
  expect(values).toContain('Science');
});

test('Excel import: preview shows problems by row and column, then imports the ready rows as drafts', async () => {
  await nav('Question bank').click();
  await page.getByRole('link', { name: 'Import', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Import questions' })).toBeVisible();

  // Fill the template the app provides, exactly as a user would.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download template' }).click(),
  ]);
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(await download.path());
  const sheet = wb.getWorksheet('Questions')!;
  const headers = (sheet.getRow(1).values as unknown[]).slice(1).map(String);
  const add = (values: Record<string, string>) => sheet.addRow(headers.map((h) => values[h] ?? ''));
  const base = {
    type: 'single_choice',
    difficulty: 'easy',
    marks: '1',
    access: 'free',
    option_a_en: 'Mercury',
    option_b_en: 'Venus',
    correct: 'a',
  };
  add({
    ...base,
    ref: 'IMP-1',
    subject: 'Science',
    question_en: 'Which planet is closest to the Sun?',
    tags: 'astronomy',
  });
  add({ ...base, ref: 'IMP-2', subject: 'Nope', question_en: 'This row has an unknown subject' });
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());

  await page.getByLabel('Upload question spreadsheet').setInputFiles({
    name: 'my-questions.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer,
  });
  await expect(page.getByRole('heading', { name: 'Preview: my-questions.xlsx' })).toBeVisible();
  const problemRow = page.getByRole('row', { name: /This row has an unknown subject/ });
  await expect(problemRow).toContainText('subject');
  await expect(problemRow).toContainText('No subject called "Nope"');
  await expect(page.getByRole('row', { name: /closest to the Sun/ })).toContainText('Ready');
  await page.getByLabel('Only rows with problems or warnings').click();
  await expect(page.getByRole('row', { name: /closest to the Sun/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Import 1 question' }).click();
  await expect(page.getByText('1 question imported as drafts').first()).toBeVisible();
  await expect(page.getByText('1 question imported', { exact: true })).toBeVisible(); // history

  await nav('Question bank').click();
  const row = page.getByRole('row', { name: /closest to the Sun/ });
  await expect(row).toContainText('Draft');
  await expect(row).toContainText('#astronomy');
});
