import { expect, test, type Page } from '@playwright/test';

/**
 * End-to-end user journeys: what a real school does in its first week and every day after. Each test walks the UI the
 * way a person would, across roles, and checks the result where the other person sees it.
 * Uses the demo seed (npm run db:seed). Development-only credentials.
 */
const PASSWORD = 'Demo-pass-2026';

async function signIn(page: Page, path: string, identifier: string, password = PASSWORD) {
  await page.goto(path);
  await page
    .getByLabel(/username|email/i)
    .first()
    .fill(identifier);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.endsWith('/login'));
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });

test('a brand-new school: owner creates it, the admin signs in and sets it up step by step', async ({ browser }) => {
  test.setTimeout(90_000); // the longest journey: two sign-ins and a full school setup
  const n = Date.now() % 100000;
  const owner = await (await browser.newContext()).newPage();
  await signIn(owner, '/platform/login', 'owner@edusaas.test');
  await expect(owner.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(owner.getByText('Monthly revenue')).toBeVisible();
  await owner.getByRole('button', { name: 'Add school' }).click();
  const form = owner.locator('form').filter({ has: owner.getByLabel('School name') });
  await form.getByLabel('School name').fill(`Journey School ${n}`);
  await form.getByLabel('Username prefix').fill(`js${n}`);
  await form.getByLabel('School Admin name').fill('Journey Admin');
  await form.getByLabel('School Admin email').fill(`journey${n}@school.test`);
  await form.getByRole('button', { name: 'Create school' }).click();
  const temp = (await owner.locator('.font-mono.font-semibold').first().innerText()).trim();
  expect(temp.length).toBeGreaterThan(8);

  // First sign-in forces a new password.
  const page = await (await browser.newContext()).newPage();
  await signIn(page, '/staff/login', `journey${n}@school.test`, temp);
  await expect(page).toHaveURL(/change-password/);
  await page.getByLabel('Temporary password').fill(temp);
  await page.getByLabel('New password', { exact: true }).fill('Journey-pass-2026!');
  await page.getByLabel('Confirm new password').fill('Journey-pass-2026!');
  await page.getByRole('button', { name: /password|save|continue/i }).click();
  await expect(page).toHaveURL(/\/staff$/);

  // An empty school sees its setup steps first, not empty numbers.
  await expect(page.getByRole('heading', { name: 'Set up your school' })).toBeVisible();
  await expect(page.getByText('0 of 7 done')).toBeVisible();
  await expect(page.getByText('Attendance today', { exact: true })).toHaveCount(0);

  // Pages that need a school year say so instead of breaking.
  await page.goto('/staff/reports');
  await expect(page.getByText('Nothing to report yet')).toBeVisible();
  await page.goto('/staff/students/import');
  await expect(page.getByText('Add classes and sections first')).toBeVisible();

  // Step 1: academic year.
  await page.goto('/staff/academics');
  await page.getByRole('button', { name: 'Create academic year' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Create year' }).click();
  await expect(page.getByRole('button', { name: 'Add class' }).first()).toBeVisible();

  // Step 2: a class with two sections.
  await page.getByRole('button', { name: 'Add class' }).first().click();
  const cls = page.getByRole('dialog');
  await cls.getByLabel('Class name').fill('5');
  await cls.getByLabel('Sections').fill('A, B');
  await cls.getByRole('button', { name: 'Create class' }).click();
  await expect(page.getByText('5-A').first()).toBeVisible();

  // Step 3: a subject.
  await nav(page).getByRole('link', { name: 'Subjects' }).click();
  // A click that lands before hydration is lost; retry until the dialog really opens.
  await expect(async () => {
    await page.getByRole('button', { name: 'Add subject' }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2000 });
  }).toPass();
  await page.getByRole('dialog').getByLabel('Name').fill('Mathematics');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('cell', { name: 'Mathematics' })).toBeVisible();

  // Step 4: a teacher.
  await nav(page).getByRole('link', { name: 'Teachers' }).click();
  await page.getByRole('button', { name: 'Add teacher' }).first().click();
  await page.getByRole('dialog').getByLabel('Full name').fill('Hamid Raza');
  await page.getByRole('dialog').getByRole('button', { name: 'Add teacher' }).click();
  // The new login is shown once, as a printable slip.
  const slip = page.getByRole('dialog', { name: 'Login created' });
  await expect(slip.getByText(`js${n}-t-hamidraza-1`)).toBeVisible();
  await slip.getByRole('button', { name: 'Done' }).click();

  // The dashboard shows the progress, and today's numbers now that classes exist.
  await nav(page).getByRole('link', { name: 'Dashboard' }).click();
  await expect(page.getByText(/[45] of 7 done/)).toBeVisible();
  await expect(page.getByText('Registers taken', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your plan' })).toBeVisible();
});

test('leave: a student asks, the Class Incharge approves, the student sees it', async ({ browser }) => {
  // A weekday a few months ahead, different on every run so requests never overlap.
  const d = new Date(Date.now() + (40 + (Date.now() % 200)) * 86_400_000);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  const day = d.toISOString().slice(0, 10);
  const reason = `Family wedding ${Date.now() % 100000}`;

  const student = await (await browser.newContext()).newPage();
  await signIn(student, '/login', 'bss-8a-ahmad-14');
  await nav(student).getByRole('link', { name: 'Leave' }).click();
  await student.getByRole('button', { name: 'Apply for leave' }).click();
  const form = student.getByRole('dialog');
  await form.getByLabel('From').fill(day);
  await form.getByLabel('To').fill(day);
  await form.getByLabel('Reason').fill(reason);
  await form.getByRole('button', { name: 'Send request' }).click();
  await expect(student.getByText(reason)).toBeVisible();

  // Ali Khan is Class Incharge of 8-A. The Leave page opens on requests waiting for him.
  const teacher = await (await browser.newContext()).newPage();
  await signIn(teacher, '/staff/login', 'bss-t-alikhan-1');
  await nav(teacher).getByRole('link', { name: 'Leave' }).click();
  await expect(teacher.getByRole('link', { name: /To approve/ })).toHaveAttribute('aria-current', 'page');
  const row = teacher.locator('li, tr').filter({ hasText: reason });
  await row.getByRole('button', { name: 'Approve' }).click();
  await expect(teacher.getByText('Request approved')).toBeVisible();

  await student.reload();
  await expect(student.locator('li, tr').filter({ hasText: reason }).getByText('Approved')).toBeVisible();
});

test('support: the school asks a question, EDUsaas answers, the school sees the reply', async ({ browser }) => {
  const n = Date.now() % 100000;
  const subject = `Printing report cards ${n}`;
  const answer = `Use Report cards on the student page. One PDF per student (${n}).`;
  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, '/staff/login', 'admin@bss.test');
  await nav(admin).getByRole('link', { name: 'Help & support' }).click();
  await admin.getByRole('button', { name: 'Ask EDUsaas for help' }).click();
  await admin.getByRole('dialog').getByLabel('Subject').fill(subject);
  await admin.getByRole('dialog').getByLabel('What happened?').fill('How do we print all report cards for one class?');
  await admin.getByRole('dialog').getByRole('button', { name: 'Send' }).click();
  await expect(admin.getByText(subject)).toBeVisible();

  // The Platform Admin (support queue switched on) sees it on their overview and answers.
  const ops = await (await browser.newContext()).newPage();
  await signIn(ops, '/platform/login', 'ops@edusaas.test');
  await expect(ops.getByRole('heading', { name: 'Questions waiting' })).toBeVisible();
  await ops.getByRole('link', { name: new RegExp(subject) }).click();
  await ops.getByLabel('Reply').fill(answer);
  await ops.getByRole('button', { name: 'Send reply' }).click();
  await expect(ops.getByText(answer)).toBeVisible();

  await admin.reload();
  await expect(admin.getByText(answer)).toBeVisible();
});

test('each school role gets its own dashboard', async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, '/staff/login', 'admin@bss.test');
  await expect(admin.getByRole('heading', { name: 'Your plan' })).toBeVisible();
  await expect(admin.getByRole('heading', { name: 'Teachers today' })).toBeVisible();
  // Settings and Help stay reachable from the menu on a laptop screen.
  await expect(nav(admin).getByRole('link', { name: 'Settings', exact: true })).toBeAttached();

  const principal = await (await browser.newContext()).newPage();
  await signIn(principal, '/staff/login', 'principal@bss.test');
  await expect(principal.getByRole('heading', { name: 'Attendance, last 30 school days' })).toBeVisible();
  await expect(principal.getByRole('heading', { name: 'Results by subject' })).toBeVisible();
  await expect(principal.getByRole('heading', { name: 'Your plan' })).toHaveCount(0);

  const admissions = await (await browser.newContext()).newPage();
  await signIn(admissions, '/staff/login', 'admissions@bss.test');
  await expect(admissions.getByRole('heading', { name: 'Seats by section' })).toBeVisible();
  await expect(admissions.getByRole('link', { name: /Import from Excel/ })).toBeVisible();
  await expect(admissions.getByText('Attendance today', { exact: true })).toHaveCount(0);
});

test('a broken page shows a friendly message, and unknown pages a clear 404', async ({ page }) => {
  await signIn(page, '/staff/login', 'admin@bss.test');
  const res = await page.goto('/staff/students/00000000-0000-0000-0000-000000000000');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to start' })).toBeVisible();
});

test('marks: a teacher enters and submits, the School Admin publishes, the student sees the mark', async ({
  browser,
}) => {
  const name = `Quiz ${Date.now() % 100000}`;
  const teacher = await (await browser.newContext()).newPage();
  await signIn(teacher, '/staff/login', 'bss-t-alikhan-1');
  await nav(teacher).getByRole('link', { name: 'Tests & marks' }).click();
  await teacher.getByRole('button', { name: 'New test' }).click();
  const form = teacher.getByRole('dialog');
  await form.getByLabel('Class and subject').selectOption({ label: '8-A · Mathematics' });
  await form.getByLabel('Test name').fill(name);
  await form.getByLabel('Total marks').fill('20');
  await form.getByRole('button', { name: 'Create & enter marks' }).click();
  await expect(teacher).toHaveURL(/\/staff\/assessments\/[0-9a-f-]{36}$/);

  const inputs = teacher.getByLabel(/^Marks for /);
  const count = await inputs.count();
  expect(count).toBeGreaterThan(5);
  for (let i = 0; i < count; i++) await inputs.nth(i).fill(String(10 + (i % 10)));
  await teacher.getByRole('button', { name: 'Submit marks' }).click();
  await teacher.getByRole('dialog').getByRole('button', { name: 'Submit' }).click();
  await expect(teacher.getByText(/submitted/i).first()).toBeVisible();

  // Not visible to students until published.
  const student = await (await browser.newContext()).newPage();
  await signIn(student, '/login', 'bss-8a-ahmad-14');
  await student.goto('/student/marks');
  await expect(student.getByText(name)).toHaveCount(0);

  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, '/staff/login', 'admin@bss.test');
  await admin.goto('/staff/assessments?tab=publish');
  await admin.getByRole('link', { name: new RegExp(name) }).click();
  await admin.getByRole('button', { name: 'Publish to students' }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Publish' }).click();
  await expect(admin.getByText(/published/i).first()).toBeVisible();

  await student.reload();
  await expect(student.getByText(name)).toBeVisible();
});
