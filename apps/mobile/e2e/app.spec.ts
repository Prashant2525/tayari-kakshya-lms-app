import { expect, test, type Page } from '@playwright/test';
import { formatBs, instantToBs } from '@tk/domain';
import { codeFromEmail, editorToken, publishedNode } from './helpers';

/**
 * Student app foundation, end to end against the real API: sign up → email code → onboarding → Home,
 * language and theme, sign out/in, password reset. Data comes from the CMS API, never from the app.
 */
const run = Date.now().toString(36);
const email = `aarati.${run}@example.com`;
const password = 'study hard every day';
const newPassword = 'a brand new password';

let page: Page;
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser, request }) => {
  const token = await editorToken(request);
  const army = await publishedNode(request, token, {
    parentId: null,
    nodeType: 'authority',
    name: { en: 'Nepal Army', ne: 'नेपाली सेना' },
    slug: `nepal-army-${run}`,
  });
  for (const [en, ne, slug] of [
    ['Sainey Likhit', 'सैनिक लिखित', 'sainey-likhit'],
    ['Officer Cadet', 'अधिकृत क्याडेट', 'officer-cadet'],
  ] as const) {
    await publishedNode(request, token, {
      parentId: army,
      nodeType: 'post',
      name: { en, ne },
      slug: `${slug}-${run}`,
    });
  }
  // A fresh installation: no stored preferences, so the language step comes first (D-074).
  page = await browser.newPage({ storageState: { cookies: [], origins: [] } });
});
test.afterAll(async () => {
  await page.close();
});

// Stack screens stay mounted underneath on the web, so every lookup is limited to what is visible.
const visible = <T extends ReturnType<Page['getByRole']>>(l: T) => l.filter({ visible: true });
const button = (name: string | RegExp) =>
  visible(page.getByRole('button', { name, exact: typeof name === 'string' }));
const field = (name: string) => visible(page.getByLabel(name, { exact: true }));
const heading = (name: string) => visible(page.getByRole('heading', { name }));
const text = (value: string | RegExp) => visible(page.getByText(value));
const role = (r: 'radio' | 'tab' | 'link' | 'checkbox' | 'alert' | 'timer', name?: string | RegExp) =>
  visible(page.getByRole(r, name === undefined ? {} : { name }));

test('sign up: validation, email code, onboarding, then Home with the BS date', async ({ request }) => {
  await page.goto('/');
  await expect(heading('Choose your language')).toBeVisible();
  // The chooser's own options (the sign-in screen underneath has a language switch too).
  const choice = page.getByRole('radiogroup', { name: 'Language / भाषा' });
  await expect(choice.getByRole('radio', { name: 'English' })).toHaveAttribute('aria-checked', 'true');
  await choice.getByRole('radio', { name: 'नेपाली' }).click();
  await expect(button('जारी राख्नुहोस्')).toBeVisible();
  await choice.getByRole('radio', { name: 'English' }).click();
  await button('Continue').click();
  await expect(heading('Welcome back')).toBeVisible();
  // Asked once: a reload goes straight to sign-in.
  await page.reload();
  await expect(heading('Welcome back')).toBeVisible();
  await expect(heading('Choose your language')).toHaveCount(0);
  await role('link', 'Create an account').click();
  await expect(heading('Create your account')).toBeVisible();

  await button('Create account').click();
  await expect(text('Enter your full name')).toBeVisible();
  await expect(text('This field is required').first()).toBeVisible();
  await expect(text('Please accept the terms to continue')).toBeVisible();

  await field('Full name').fill('Aarati Sharma');
  await field('Email').fill(email);
  await field('Password').fill('short');
  await role('checkbox', /I agree/).click();
  await button('Create account').click();
  await expect(text('Password must be at least 8 characters')).toBeVisible();
  await field('Password').fill(password);
  await button('Create account').click();

  await expect(heading('Verify your account')).toBeVisible();
  // D-061: the emails matter (neutral wording: nothing about buying in the app).
  await expect(text('Important: check your email')).toBeVisible();
  const sentAt = new Date();
  await button('Send code').click();
  await expect(text(/We sent a code to aa••••@example\.com/)).toBeVisible();
  await expect(role('timer')).toContainText('Resend code in');
  // A wrong code is refused with a translated message.
  await field('6-digit code').fill('000000');
  await expect(role('alert').filter({ hasText: 'That code is not correct.' })).toBeVisible();
  const code = await codeFromEmail(request, email, sentAt);
  await field('6-digit code').fill(code);

  // Verified → onboarding with categories from the CMS.
  await expect(heading('What are you preparing for?')).toBeVisible();
  await expect(role('tab', 'Nepal Army')).toHaveAttribute('aria-selected', 'true');
  await field('Search').fill('cadet');
  await expect(role('radio', 'Sainey Likhit')).toHaveCount(0);
  await field('Search').fill('');
  await role('radio', 'Sainey Likhit').click();
  await expect(role('radio', 'Sainey Likhit')).toHaveAttribute('aria-checked', 'true');
  await button('Continue').click();

  await expect(heading('Namaste, Aarati')).toBeVisible();
  await expect(text(formatBs(instantToBs(new Date()), 'en'))).toBeVisible();
  await expect(text(/Preparing for · Nepal Army/)).toBeVisible();
  await expect(text('Sainey Likhit')).toBeVisible();
  await expect(heading('Courses for you')).toBeVisible();
});

test('profile: Nepali and dark theme apply at once and survive a reload', async () => {
  await role('tab', 'Profile').click();
  await expect(heading('Profile')).toBeVisible();
  await expect(text('Verified')).toBeVisible();

  await role('radio', 'नेपाली').click();
  await expect(heading('प्रोफाइल')).toBeVisible();
  await expect(text('सैनिक लिखित को तयारी')).toBeVisible();
  await role('radio', 'अँध्यारो').click();
  await expect(role('radio', 'अँध्यारो')).toHaveAttribute('aria-checked', 'true');

  await page.reload();
  await expect(heading('प्रोफाइल')).toBeVisible();
  await role('tab', 'गृहपृष्ठ').click();
  await expect(heading('नमस्ते, Aarati')).toBeVisible();
  await expect(text(formatBs(instantToBs(new Date()), 'ne'))).toBeVisible();

  // Back to English and the light theme for the remaining tests.
  await role('tab', 'प्रोफाइल').click();
  await role('radio', 'English').click();
  await role('radio', 'Light').click();
  await expect(heading('Profile')).toBeVisible();
});

test('log out, a wrong password is refused, then logging in goes straight to Home', async () => {
  await button('Log out').click();
  await expect(heading('Welcome back')).toBeVisible();
  await field('Email').fill(email);
  await field('Password').fill('not my password');
  await button('Log in').click();
  await expect(role('alert').filter({ hasText: 'Email or password is incorrect.' })).toBeVisible();
  await field('Password').fill(password);
  await button('Log in').click();
  await expect(heading('Namaste, Aarati')).toBeVisible();
});

test('forgot password: code by email, new password, sign in with it', async ({ request }) => {
  await role('tab', 'Profile').click();
  await button('Log out').click();
  await role('link', 'Forgot password?').click();
  await expect(heading('Forgot your password?')).toBeVisible();
  const sentAt = new Date();
  await field('Email').fill(email);
  await button('Send code').click();
  await expect(heading('Set a new password')).toBeVisible();
  const code = await codeFromEmail(request, email, sentAt);
  await field('6-digit code').fill(code);
  await field('New password').fill(newPassword);
  await button('Reset password').click();

  await expect(text('Password changed. Please log in with your new password.')).toBeVisible();
  await field('Email').fill(email);
  await field('Password').fill(newPassword);
  await button('Log in').click();
  await expect(heading('Namaste, Aarati')).toBeVisible();
});
