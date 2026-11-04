import { expect, test, type Page } from '@playwright/test';

// Uses the demo seed (npm run db:seed). Development-only credentials.
const PASSWORD = 'Demo-pass-2026';

async function signIn(page: Page, path: string, identifier: string) {
  await page.goto(path);
  await page
    .getByLabel(/username|email/i)
    .first()
    .fill(identifier);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('student signs in on the student portal and signs out', async ({ page }) => {
  await signIn(page, '/login', 'BSS-8A-Ahmad-14');
  await expect(page).toHaveURL(/\/student$/);
  await expect(page.getByRole('heading', { name: /Hello, Ahmad/ })).toBeVisible();
  await expect(page.getByText('bss-8a-ahmad-14')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/student');
  await expect(page).toHaveURL(/\/login$/);
});

test('student credentials do not work on the staff portal', async ({ page }) => {
  await signIn(page, '/staff/login', 'bss-8a-ahmad-14');
  await expect(page.getByText('Invalid username/email or password')).toBeVisible();
  await expect(page).toHaveURL(/\/staff\/login$/);
});

test('teacher signs in on the staff portal and cannot open settings', async ({ page }) => {
  await signIn(page, '/staff/login', 'bss-t-alikhan-1');
  await expect(page).toHaveURL(/\/staff$/);
  await expect(page.getByRole('link', { name: 'Settings', exact: true })).toHaveCount(0);
  await page.goto('/staff/settings');
  await expect(page).toHaveURL(/\/staff$/);
});

test('a staff session cannot open the student area', async ({ page }) => {
  await signIn(page, '/staff/login', 'admin@bss.test');
  await expect(page).toHaveURL(/\/staff$/);
  await page.goto('/student');
  await expect(page).toHaveURL(/\/login$/);
});

test('school admin changes a principal permission', async ({ page }) => {
  await signIn(page, '/staff/login', 'admin@bss.test');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'School settings' })).toBeVisible();
  const toggle = page.locator('#perm-PRINCIPAL-promotion-run');
  const before = await toggle.isChecked();
  await toggle.click();
  await expect(toggle).toBeChecked({ checked: !before });
  await toggle.click();
  await expect(toggle).toBeChecked({ checked: before });
});

test('platform owner sees schools but no school data', async ({ page }) => {
  await signIn(page, '/platform/login', 'owner@edusaas.test');
  await expect(page).toHaveURL(/\/platform$/);
  await expect(page.getByRole('cell', { name: /Bright Star School/ })).toBeVisible();
  await page.goto('/staff/users');
  await expect(page).toHaveURL(/\/staff\/login$/);
});

test('pages send a nonce-based CSP', async ({ page }) => {
  const res = await page.goto('/login');
  const csp = res?.headers()['content-security-policy'] ?? '';
  expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(csp).toContain("frame-ancestors 'none'");
});
