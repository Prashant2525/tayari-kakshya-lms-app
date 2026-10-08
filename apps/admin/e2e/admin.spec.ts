import { expect, test, type Page } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from './e2e-env.mjs';

// RFC 6238 code generator for the authenticator step.
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(s: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of s) {
    value = (value << 5) | B32.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
function totp(secret: string, offsetSteps = 0): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + offsetSteps));
  const h = createHmac('sha1', base32(secret)).update(msg).digest();
  const o = (h[h.length - 1] ?? 0) & 15;
  const n = (((h[o] ?? 0) & 127) << 24) | ((h[o + 1] ?? 0) << 16) | ((h[o + 2] ?? 0) << 8) | (h[o + 3] ?? 0);
  return String(n % 1_000_000).padStart(6, '0');
}

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(E2E_ADMIN_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(E2E_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test.describe.configure({ mode: 'serial' });

let secret = '';

test('wrong password shows an error and no session is created', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('Email').fill(E2E_ADMIN_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill('definitely wrong');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Email or password is incorrect.')).toBeVisible();
});

test('a Super Admin must enrol in two-factor before using the panel', async ({ page }) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/account/);
  await expect(page.getByText('Two-factor authentication is required for your account')).toBeVisible();
  // Restricted sections are hidden until enrolment.
  await expect(page.getByRole('link', { name: 'Students' })).toHaveCount(0);

  await page.goto('/students');
  await expect(page).toHaveURL(/\/account/);

  await page.getByRole('button', { name: 'Set up two-factor authentication' }).click();
  await expect(page.getByRole('img', { name: /QR code/ })).toBeVisible();
  secret = ((await page.locator('code').first().textContent()) ?? '').trim();
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);

  await page.getByLabel('6-digit code').fill('000000');
  await page.getByRole('button', { name: 'Verify and turn on' }).click();
  await expect(page.getByText('That code did not match')).toBeVisible();

  await page.getByLabel('6-digit code').fill(totp(secret));
  await page.getByRole('button', { name: 'Verify and turn on' }).click();
  await expect(page.getByLabel('Recovery codes').getByRole('listitem')).toHaveCount(10);
  await page.getByRole('button', { name: 'I have saved them' }).click();
  await expect(page.getByRole('link', { name: 'Students' })).toBeVisible();
});

test('signing in again requires the authenticator code, and the session survives a reload', async ({
  page,
}) => {
  await signIn(page);
  await expect(page.getByText('Two-factor verification')).toBeVisible();
  await expect(page.getByLabel('Authentication code')).toHaveValue('');
  await page.getByLabel('Authentication code').fill(totp(secret, 1));
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await expect(page.getByRole('heading', { name: /Namaste/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: /Namaste/ })).toBeVisible();

  // Manage roles, education levels and settings in the same session.
  await page.getByRole('link', { name: 'Roles & permissions' }).click();
  await page.getByRole('link', { name: 'New role' }).click();
  await page.getByLabel('Role name').fill('Support Agent');
  await page.getByLabel('View students and their account details').check();
  await page.getByRole('button', { name: 'Create role' }).click();
  await expect(page.getByText('Role created')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Support Agent' })).toBeVisible();

  await page.getByRole('link', { name: 'Staff' }).click();
  await page.getByRole('button', { name: 'Invite staff' }).click();
  await page.getByLabel('Full name').fill('Sita Sharma');
  await page.getByLabel('Work email').fill('sita@example.test');
  await page.getByLabel(/Support Agent/).check();
  await page.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByText('Invitation sent to sita@example.test')).toBeVisible();
  const row = page.getByRole('row', { name: /Sita Sharma/ });
  await expect(row.getByText('Invitation pending')).toBeVisible();
  await expect(row.getByText('Support Agent')).toBeVisible();

  await page.getByRole('link', { name: 'Education levels' }).click();
  await page.getByRole('button', { name: 'Add level' }).click();
  await page.getByLabel('Name (English)').fill('Bachelor');
  await page.getByLabel('नाम (नेपाली)').fill('स्नातक');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Education level added')).toBeVisible();
  await expect(page.getByText('स्नातक')).toBeVisible();

  await page.getByRole('link', { name: 'System settings' }).click();
  const deletion = page.getByRole('region', { name: 'Account deletion grace period' });
  await deletion.getByLabel('Grace period (days)').fill('10');
  await deletion.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Account deletion grace period saved')).toBeVisible();

  // Attempt rules are CMS defaults (D-048): a changed default prefills every new assessment.
  const defaults = page.getByRole('region', { name: 'Assessment defaults' });
  await expect(defaults.getByLabel('Official attempt (with retakes)')).toHaveValue('first');
  await defaults.getByLabel('Official attempt (with retakes)').selectOption('best');
  await defaults.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Assessment defaults saved')).toBeVisible();
  await page.goto('/assessments/new?type=quiz');
  await expect(page.getByLabel('Official attempt')).toHaveValue('best');
  await expect(page.getByLabel('Premium access')).toHaveValue('linked');
  await page.getByRole('link', { name: 'System settings' }).click();

  // VAT details are CMS data (D-055): registering needs the PAN / VAT number and business name.
  const vat = page.getByRole('region', { name: 'VAT and business details' });
  await expect(vat.getByLabel('VAT rate (%)')).toHaveValue('13');
  await vat.getByRole('switch', { name: 'VAT-registered' }).click();
  await vat.getByRole('button', { name: 'Save' }).click();
  await expect(vat.getByText('Enter the PAN / VAT number')).toBeVisible();
  await vat.getByLabel('PAN / VAT number').fill('123456789');
  await vat.getByLabel('Registered business name').fill('Test Academy Pvt. Ltd.');
  await vat.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('VAT and business details saved')).toBeVisible();
  // The referral programme cannot be switched on without its discounts (D-058).
  const referrals = page.getByRole('region', { name: 'Referral programme' });
  await referrals.getByRole('switch', { name: 'Programme on' }).click();
  await referrals.getByRole('button', { name: 'Save' }).click();
  await expect(referrals.getByText('Enter the percentage')).toBeVisible();
  await referrals.getByRole('button', { name: 'Discard' }).click();
  // The how-to-get-courses box under student emails is CMS text (D-061).
  const guide = page.getByRole('region', { name: 'How-to-get-courses box in emails' });
  await expect(guide.getByLabel('iPhone / iPad (highlighted) (English)')).toHaveValue(
    /cannot be bought in the app/,
  );
  // Exam reminder times are CMS data (D-060): 1 day and 1 hour to start; the same time twice is refused.
  const reminders = page.getByRole('region', { name: 'Exam reminders' });
  await expect(reminders.getByLabel('Reminder 1', { exact: true })).toHaveValue('1');
  await expect(reminders.getByLabel('Reminder 1 unit')).toHaveValue('days');
  await expect(reminders.getByLabel('Reminder 2 unit')).toHaveValue('hours');
  await reminders.getByRole('button', { name: 'Add a reminder' }).click();
  await reminders.getByRole('button', { name: 'Save' }).click();
  await expect(reminders.getByText('Each reminder time once')).toBeVisible();
  await reminders.getByLabel('Reminder 3', { exact: true }).fill('15');
  await reminders.getByLabel('Reminder 3 unit').selectOption('minutes');
  await reminders.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Exam reminders saved')).toBeVisible();
  await expect(reminders.getByLabel('Reminder 3', { exact: true })).toHaveValue('15');
  await expect(reminders.getByRole('button', { name: 'Add a reminder' })).toHaveCount(0);
  // Progress analytics thresholds are CMS data (D-066); the weak line cannot be above the strong line.
  const analytics = page.getByRole('region', { name: 'Progress analytics' });
  await expect(analytics.getByLabel('Accuracy over the last (days)')).toHaveValue('90');
  await expect(analytics.getByLabel('Strong from (%)')).toHaveValue('80');
  await analytics.getByLabel('Weak below (%)').fill('90');
  await analytics.getByRole('button', { name: 'Save' }).click();
  await expect(analytics.getByText('The weak line must not be above the strong line')).toBeVisible();
  await analytics.getByLabel('Weak below (%)').fill('60');
  await analytics.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Progress analytics saved')).toBeVisible();
  // Back off, so later suites price orders without VAT.
  await vat.getByRole('switch', { name: 'VAT-registered' }).click();
  await vat.getByRole('button', { name: 'Save' }).click();
  await expect(vat.getByRole('switch', { name: 'VAT-registered' })).not.toBeChecked();

  await page.getByRole('link', { name: 'Audit log' }).click();
  await expect(page.getByText('settings.update').first()).toBeVisible();
  await expect(page.getByText('staff.create')).toBeVisible();
  await expect(page.getByText('auth.mfa_enabled')).toBeVisible();

  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/staff');
  await expect(page).toHaveURL(/\/login/);
});
