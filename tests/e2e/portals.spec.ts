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
  await expect(page.getByText('bss-8a-ahmad-14').first()).toBeVisible();
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

test('school admin admits a student and gets a printable login slip', async ({ page }) => {
  await signIn(page, '/staff/login', 'admin@bss.test');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Students', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Students' })).toBeVisible();
  await page.getByRole('button', { name: 'Admit student' }).click();
  const drawer = page.getByRole('dialog', { name: 'Admit a student' });
  await drawer.getByLabel('Full name').fill('Playwright Test');
  const option = drawer.locator('#sectionId option', { hasText: /^7-B/ });
  await drawer.getByLabel('Class & section').selectOption((await option.getAttribute('value'))!);
  await drawer.getByRole('button', { name: 'Admit student' }).click();
  const slip = page.getByRole('dialog', { name: 'Login created' });
  await expect(slip.getByText(/^bss-7b-playwright-\d+$/)).toBeVisible();
  await expect(slip.getByText('Temporary password')).toBeVisible();
});

test('teacher sees only their own classes', async ({ page }) => {
  await signIn(page, '/staff/login', 'bss-t-alikhan-1');
  await expect(page).toHaveURL(/\/staff$/);
  await expect(page.getByRole('heading', { name: 'My classes' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'My students' }).click();
  await expect(page.getByRole('heading', { name: 'My students' })).toBeVisible();
  await page.getByLabel('Search students').fill('Ahmad Raza');
  await expect(page.getByRole('link', { name: /Ahmad Raza/ })).toBeVisible();
  await page.goto('/staff/academics');
  await expect(page).toHaveURL(/\/staff$/);
});

test('classes & sections page shows the structure and incharge pickers', async ({ page }) => {
  await signIn(page, '/staff/login', 'admin@bss.test');
  await expect(page).toHaveURL(/\/staff$/);
  await page.goto('/staff/academics');
  await expect(page.getByRole('heading', { name: 'Classes & sections' })).toBeVisible();
  await expect(page.getByLabel('Class Incharge for 8-A')).toHaveValue(/.+/);
  await expect(page.getByLabel('Class Incharge for 10-B')).toHaveValue('');
});

// ── Phase 3: daily operations ───────────────────────────────────────────────

test('teacher checks in and takes a register', async ({ page }) => {
  await signIn(page, '/staff/login', 'bss-t-alikhan-1');
  await expect(page).toHaveURL(/\/staff$/);
  const checkIn = page.getByRole('button', { name: 'Check in' });
  if (await checkIn.isVisible()) {
    await checkIn.click();
    await expect(page.getByText(/^Checked in ·/)).toBeVisible();
  }
  await page.goto('/staff/attendance');
  await page.locator('a[href^="/staff/attendance/"]').first().click();
  await expect(page.getByRole('radiogroup').first()).toBeVisible();
  // Flip the first student between Late and Present so the register always has a change to save.
  const late = page.getByRole('radio', { name: 'Late' }).first();
  if ((await late.getAttribute('aria-checked')) === 'true')
    await page.getByRole('radio', { name: 'Present' }).first().click();
  else await late.click();
  const markRest = page.getByRole('button', { name: 'Mark rest present' });
  if (await markRest.isVisible()) await markRest.click();
  await page.getByRole('button', { name: /Submit attendance|Save changes/ }).click();
  await expect(page.getByText(/^Attendance (saved|updated)$/)).toBeVisible();
});

test('student sees attendance, marks and timetable', async ({ page }) => {
  await signIn(page, '/login', 'bss-8a-ahmad-14');
  await expect(page.getByRole('heading', { name: /^Hello, / })).toBeVisible();
  await page.goto('/student/attendance');
  await expect(page.getByText(/\d+(\.\d)?%/).first()).toBeVisible();
  await page.goto('/student/marks');
  await expect(page.getByText('Unit Test 1').first()).toBeVisible();
  await page.goto('/student/timetable');
  await expect(page.getByText('Mathematics').first()).toBeVisible();
});

test('school admin dashboard shows today at a glance', async ({ page }) => {
  await signIn(page, '/staff/login', 'admin@bss.test');
  await expect(page.getByText('Attendance today', { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole('heading', { name: 'Registers not taken today' })
      .or(page.getByText('Registers taken', { exact: true }))
      .first(),
  ).toBeVisible();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Leave' }).click();
  await expect(page.getByRole('heading', { name: 'Leave' })).toBeVisible();
});

// ── Phase 4: management ─────────────────────────────────────────────────────

test('search with Ctrl+K opens a student', async ({ page }) => {
  await signIn(page, '/staff/login', 'admin@bss.test');
  await expect(page).toHaveURL(/\/staff$/);
  await expect(page.getByRole('button', { name: /Search/ })).toBeVisible();
  await page.waitForLoadState('networkidle'); // shortcut listener is attached after hydration
  await page.keyboard.press('Control+k');
  await page.getByLabel('Search students, teachers or pages').fill('Ahmad Raza');
  await page.getByRole('option').filter({ hasText: 'Ahmad Raza' }).first().click();
  await expect(page).toHaveURL(/\/staff\/students\/[0-9a-f-]{36}$/);
});

test('school admin imports students from a file and gets their logins', async ({ page }) => {
  await signIn(page, '/staff/login', 'admin@bss.test');
  await expect(page).toHaveURL(/\/staff$/);
  await page.goto('/staff/students/import');
  const n = Date.now() % 100000;
  const csv = [
    'Student name,Class,Section,Admission no,Gender,Date of birth,Guardian name,Guardian phone,Address',
    `Import Test ${n},7,B,,Female,,,,`,
    `Import Two ${n},7,B,,Male,,,,`,
    'Nobody,99,Z,,,,,,',
  ].join('\n');
  await page
    .getByLabel('Choose a file to import')
    .setInputFiles({ name: 'students.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByText('Ready to import')).toBeVisible();
  await expect(page.getByText('No section 99-Z this year')).toBeVisible();
  await page.getByRole('button', { name: 'Import 2 students' }).click();
  await expect(page.getByText('2 students added.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Download logins/ })).toBeVisible();
});

test('reports show attendance and the at-risk list', async ({ page }) => {
  await signIn(page, '/staff/login', 'principal@bss.test');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Reports' }).click();
  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download CSV' })).toBeVisible();
  await page.getByRole('link', { name: 'At risk' }).click();
  await expect(page.getByText(/below 75% attendance/)).toBeVisible();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Audit log' }).click();
  await expect(page.getByRole('heading', { name: 'Audit log' })).toBeVisible();
});

// ── Phase 5: report cards, support access ───────────────────────────────────

test('student downloads their report card as a PDF', async ({ page }) => {
  await signIn(page, '/login', 'bss-8a-ahmad-14');
  await expect(page.getByRole('heading', { name: /^Hello, / })).toBeVisible();
  await page.goto('/student/marks');
  await expect(page.getByRole('link', { name: 'Report card (PDF)' })).toBeVisible();
  const res = await page.request.get('/api/v1/report-card/me');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('application/pdf');
  expect((await res.body()).subarray(0, 5).toString()).toBe('%PDF-');
});

test('platform owner can only ask a school for support access', async ({ page }) => {
  await signIn(page, '/platform/login', 'owner@edusaas.test');
  await page.getByRole('link', { name: 'Bright Star School' }).click();
  await expect(page.getByRole('heading', { name: 'Bright Star School' })).toBeVisible();
  await expect(page.getByText('You can’t see this school’s data unless its School Admin allows it')).toBeVisible();
  const view = await page.request.get(
    page.url().replace('/platform/tenants/', '/api/v1/platform/tenants/') + '/support/view',
  );
  expect(view.status()).toBe(403); // no school has approved a request in the seed
});
