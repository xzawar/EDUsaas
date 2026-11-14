import { expect, test, type Page } from '@playwright/test';

/**
 * Finance journeys (spec §2): the accountant collects at the counter and prints a receipt; a parent sends proof and
 * the office confirms it; payroll runs; the principal reads reports; a teacher sees none of it.
 * Uses the demo seed. Development-only credentials.
 */
const PASSWORD = 'Demo-pass-2026';

async function signIn(page: Page, path: string, identifier: string) {
  await page.goto(path);
  await page
    .getByLabel(/username|email/i)
    .first()
    .fill(identifier);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.endsWith('/login'));
}
const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });

test('accountant: dashboard is the money overview, collects a fee at the counter and gets a receipt PDF', async ({
  page,
}) => {
  await signIn(page, '/staff/login', 'accounts@bss.test');
  await expect(page.getByText('Collected today')).toBeVisible();
  await expect(page.getByText('Outstanding', { exact: true })).toBeVisible();
  // No attendance or marks for the accountant.
  await expect(nav(page).getByRole('link', { name: 'Attendance' })).toHaveCount(0);

  await nav(page).getByRole('link', { name: 'Collect fees' }).click();
  await page.getByLabel('Find a student').fill('bss-8a-ahmad-14');
  await page.getByRole('option').filter({ hasText: 'bss-8a-ahmad-14' }).first().click();
  await expect(page.getByText('Outstanding')).toBeVisible();
  const payButtons = page.getByRole('button', { name: 'Pay', exact: true });
  if ((await payButtons.count()) === 0) test.skip(true, 'Demo student has no open bill right now');
  await payButtons.first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Amount received').fill('100');
  await dialog.getByRole('button', { name: 'Record payment' }).click();
  const receipt = page.getByRole('dialog', { name: /Receipt R-\d+/ });
  await expect(receipt).toBeVisible();
  const href = await receipt.getByRole('link', { name: /Print/ }).getAttribute('href');
  const pdf = await page.request.get(href!);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toBe('application/pdf');
  await receipt.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText(/R-\d{6}/).first()).toBeVisible();
});

test('parent sends payment proof; accountant confirms; parent sees the receipt', async ({ browser }) => {
  const student = await (await browser.newContext()).newPage();
  await signIn(student, '/login', 'bss-8a-ayesha-15');
  await nav(student).getByRole('link', { name: 'Fees' }).click();
  await expect(student.getByRole('heading', { name: 'Fees' })).toBeVisible();
  const btn = student.getByRole('button', { name: 'I have paid' });
  if ((await btn.count()) === 0) test.skip(true, 'Demo student has nothing to pay right now');
  await btn.click();
  const form = student.getByRole('dialog');
  const ref = `TX${Date.now() % 1_000_000}`;
  await form.getByLabel('Amount paid').fill('50');
  await form.getByLabel('Transaction ID').fill(ref);
  // A tiny real PNG as the "screenshot".
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  await form
    .getByLabel('Screenshot of the payment')
    .setInputFiles({ name: 'proof.png', mimeType: 'image/png', buffer: png });
  await form.getByRole('button', { name: 'Send proof' }).click();
  await expect(student.getByText('Waiting for the school office')).toBeVisible();
  await expect(student.getByText(ref)).toBeVisible();

  const acc = await (await browser.newContext()).newPage();
  await signIn(acc, '/staff/login', 'accounts@bss.test');
  await nav(acc).getByRole('link', { name: 'Payment proofs' }).click();
  const row = acc.locator('li').filter({ hasText: ref });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Confirm' }).click();
  await expect(acc.getByText('Payment confirmed and receipt issued')).toBeVisible();

  await student.reload();
  await expect(student.getByText('Waiting for the school office')).toHaveCount(0);
  await expect(student.getByRole('heading', { name: 'Receipts' })).toBeVisible();
});

test('payroll: set a salary, run the month, finalise, pay; the teacher sees the payslip', async ({ browser }) => {
  const acc = await (await browser.newContext()).newPage();
  await signIn(acc, '/staff/login', 'accounts@bss.test');
  await nav(acc).getByRole('link', { name: 'Payroll' }).click();
  await expect(acc.getByRole('heading', { name: 'Monthly runs' })).toBeVisible();
  await expect(acc.getByText(/of \d+ staff have a salary set/)).toBeVisible();

  // Pick a month that has no payroll yet; the seed covers the previous two months.
  const existing = await acc.locator('table').first().innerText();
  await acc.getByRole('button', { name: 'New payroll' }).click();
  const dialog = acc.getByRole('dialog');
  const options = await dialog.getByLabel('Month').locator('option').allTextContents();
  const free = options.find((o) => !existing.includes(o));
  if (!free) test.skip(true, 'Every selectable month already has a payroll run');
  await dialog.getByLabel('Month').selectOption({ label: free! });
  await dialog.getByRole('button', { name: 'Create draft' }).click();
  await expect(acc).toHaveURL(/\/staff\/finance\/payroll\/[0-9a-f-]{36}$/);
  await expect(acc.getByText('Draft — check the amounts')).toBeVisible();
  await acc.getByRole('button', { name: 'Finalise' }).click();
  await acc.getByRole('dialog').getByRole('button', { name: 'Finalise' }).click();
  await expect(acc.getByText(/\d+ to pay/)).toBeVisible();
  await acc.getByRole('button', { name: 'Mark all paid' }).click();
  await acc.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
  await expect(acc.getByText('Paid', { exact: true }).first()).toBeVisible();

  const teacher = await (await browser.newContext()).newPage();
  await signIn(teacher, '/staff/login', 'bss-t-alikhan-1');
  await nav(teacher).getByRole('link', { name: 'My payslips' }).click();
  const pdfLink = teacher.getByRole('link', { name: 'PDF' }).first();
  await expect(pdfLink).toBeVisible();
  const res = await teacher.request.get((await pdfLink.getAttribute('href'))!);
  expect(res.headers()['content-type']).toBe('application/pdf');
});

test('principal reads money reports and downloads CSV; teacher has no finance at all', async ({ browser }) => {
  const principal = await (await browser.newContext()).newPage();
  await signIn(principal, '/staff/login', 'principal@bss.test');
  await nav(principal).getByRole('link', { name: 'Money reports' }).click();
  await expect(principal.getByText('Still owed (all months)')).toBeVisible();
  await principal.getByRole('link', { name: 'Defaulters' }).click();
  await expect(principal.getByText(/owe .* on bills past due/)).toBeVisible();
  const csv = await principal.request.get('/api/v1/finance/reports/defaulters?format=csv');
  expect(csv.status()).toBe(200);
  expect(csv.headers()['content-type']).toContain('text/csv');
  // Principal cannot collect.
  await principal.goto('/staff/finance/collect');
  await expect(principal).toHaveURL(/\/staff$/);

  const teacher = await (await browser.newContext()).newPage();
  await signIn(teacher, '/staff/login', 'bss-t-alikhan-1');
  await expect(nav(teacher).getByRole('link', { name: 'Collect fees' })).toHaveCount(0);
  await teacher.goto('/staff/finance');
  await expect(teacher).toHaveURL(/\/staff$/);
  expect((await teacher.request.get('/api/v1/finance/overview')).status()).toBe(403);
});

test('fee setup: a new school admin adds a head and amounts, then generates the month', async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, '/staff/login', 'admin@gvs.test');
  await nav(admin).getByRole('link', { name: 'Fee setup' }).click();
  await expect(admin.getByRole('heading', { name: 'Fee heads' })).toBeVisible();
  const name = `Lab ${Date.now() % 10000}`;
  await admin.getByRole('button', { name: 'Add fee head' }).click();
  await admin.getByRole('dialog').getByLabel('Name').fill(name);
  await admin.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();
  await expect(admin.getByText(name).first()).toBeVisible();
  await nav(admin).getByRole('link', { name: 'Fee bills' }).click();
  await expect(admin.getByRole('button', { name: 'Generate month' })).toBeEnabled();
});
