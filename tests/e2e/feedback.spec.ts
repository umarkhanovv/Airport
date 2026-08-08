import { expect, test, type Page } from '@playwright/test';

import { ADMIN_STORAGE_STATE } from './admin-session';

/**
 * Feedback form and admin inbox — Stage 7 (spec §9, plan §9.1).
 *
 * The stage's exit criterion is that the form works with SMTP entirely absent,
 * which is how the e2e server runs: no SMTP_* variables are set in
 * playwright.config.ts. Delivery with SMTP configured is covered against a real
 * socket in tests/unit/feedback-mail.test.ts.
 */

const CONTACTS = '/ru/contacts';

/** Unique per test run, so parallel tests never read each other's messages. */
function uniqueMessage(label: string): string {
  return `${label} ${Math.random().toString(36).slice(2, 10)} — this is a long enough message body.`;
}

async function fillForm(page: Page, message: string, name = 'Айгүл Серікова') {
  await page.locator('#name').fill(name);
  await page.locator('#message').fill(message);
}

/**
 * Each describe submits from its own address.
 *
 * The form allows five submissions per IP (plan §9.1), and the whole suite
 * otherwise shares one — so the sixth test to submit was refused and failed,
 * the limiter behaving exactly as designed. Distinct `x-forwarded-for` values
 * model what these tests actually represent: different members of the public,
 * which is also how the limiter sees real traffic behind the reverse proxy.
 */
test.describe('the public form', () => {
  test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.11' } });

  test('renders on the contacts page in every locale', async ({ page }) => {
    for (const path of ['/ru/contacts', '/en/contacts', '/kz/contacts']) {
      await page.goto(path);
      await expect(page.locator('#name')).toBeVisible();
      await expect(page.locator('#message')).toBeVisible();
      // The label is translated, so it must not be the raw key.
      await expect(page.locator('label[for="name"]')).not.toHaveText(/Feedback\./);
    }
  });

  test('accepts a submission and confirms it', async ({ page }) => {
    await page.goto(CONTACTS);
    await fillForm(page, uniqueMessage('Accepted'));

    // The time-trap rejects anything submitted within two seconds of render.
    await page.waitForTimeout(2100);
    await page.getByRole('button', { name: 'Отправить' }).click();

    await expect(page.getByRole('status')).toContainText('Спасибо');
  });

  test('reports validation errors per field without losing the page', async ({ page }) => {
    await page.goto(CONTACTS);
    await page.locator('#name').fill('A');
    await page.locator('#message').fill('short');
    await page.waitForTimeout(2100);
    await page.getByRole('button', { name: 'Отправить' }).click();

    await expect(page.locator('#name-error')).toBeVisible();
    await expect(page.locator('#message-error')).toBeVisible();
    await expect(page.locator('#name')).toHaveAttribute('aria-invalid', 'true');
  });

  test('rejects a submission made faster than a person could type', async ({ page }) => {
    await page.goto(CONTACTS);

    // Submitted immediately, with nothing filled in. The time-trap runs before
    // validation, so what comes back proves which check fired: the "too fast"
    // message rather than per-field errors.
    //
    // Forging the token instead cannot be tested from the browser — React owns
    // the hidden input and restores the real value on re-render. Signature
    // rejection is covered in tests/unit/feedback-antispam.test.ts.
    await page.getByRole('button', { name: 'Отправить' }).click();

    // Targeted by id, not by role: Next renders its own aria-live route
    // announcer with role="alert", so getByRole('alert') is ambiguous — and
    // ambiguous only once hydration has got that far, which made this fail
    // whenever the server was loaded enough to lose that race. Same reasoning
    // as tests/e2e/admin.spec.ts.
    await expect(page.locator('#feedback-form-error')).toBeVisible();
    await expect(page.locator('#feedback-form-error')).toContainText('слишком быстро');
    await expect(page.locator('#name-error')).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveCount(0);
  });

  test('submits without JavaScript', async ({ browser }) => {
    // Someone on a slow connection with scripting off must still be able to
    // report a problem — the Server Action progressively enhances.
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto(CONTACTS);
    const message = uniqueMessage('NoScript');
    await fillForm(page, message);
    await page.waitForTimeout(2100);
    await page.getByRole('button', { name: 'Отправить' }).click();

    await expect(page.getByRole('status')).toContainText('Спасибо');
    await context.close();
  });
});

test.describe('anti-spam', () => {
  test.use({
    storageState: ADMIN_STORAGE_STATE,
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.12' },
  });

  test('a filled honeypot looks successful but stores nothing', async ({ page }) => {
    const message = uniqueMessage('Honeypot');

    await page.goto(CONTACTS);
    await fillForm(page, message);
    await page.locator('input[name="website"]').fill('http://spam.example', { force: true });
    await page.waitForTimeout(2100);
    await page.getByRole('button', { name: 'Отправить' }).click();

    // The bot is told what a person would be told; nothing is revealed.
    await expect(page.getByRole('status')).toContainText('Спасибо');

    await page.goto('/admin/feedback');
    await expect(page.getByText(message)).toHaveCount(0);
  });

  test('the honeypot is hidden from people and from assistive technology', async ({ page }) => {
    await page.goto(CONTACTS);

    const honeypot = page.locator('input[name="website"]');

    // Hidden by being positioned off-screen rather than with display:none —
    // some bots skip fields that are display:none, which would defeat it.
    const box = await honeypot.boundingBox();
    expect(box, 'the honeypot should be laid out, just off-screen').not.toBeNull();
    expect(box!.x + box!.width, 'must sit entirely left of the viewport').toBeLessThan(0);

    // Out of the tab order, out of the accessibility tree, out of autofill —
    // so no person, screen reader or password manager ever fills it in.
    await expect(honeypot).toHaveAttribute('tabindex', '-1');
    await expect(honeypot).toHaveAttribute('autocomplete', 'off');
    await expect(page.locator('div[aria-hidden="true"] input[name="website"]')).toHaveCount(1);
  });
});

test.describe('the admin inbox', () => {
  test('is not reachable without signing in', async ({ page }) => {
    await page.goto('/admin/feedback');
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});

test.describe('the admin inbox, signed in', () => {
  // One shared session from auth.setup: signing in per test would trip the
  // login rate limiter, which counts every attempt from this address.
  test.use({
    storageState: ADMIN_STORAGE_STATE,
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.13' },
  });

  test('shows a submission and marks it read', async ({ page }) => {
    const message = uniqueMessage('Inbox');

    await page.goto(CONTACTS);
    await fillForm(page, message, 'Пассажир Тестов');
    await page.locator('#email').fill('passenger@example.kz');
    await page.locator('#subject').fill('Забытая вещь');
    await page.waitForTimeout(2100);
    await page.getByRole('button', { name: 'Отправить' }).click();
    await expect(page.getByRole('status')).toBeVisible();

    await page.goto('/admin/feedback');

    const item = page.locator('[data-testid="feedback-item"]', { hasText: message });
    await expect(item).toHaveCount(1);
    await expect(item).toContainText('Пассажир Тестов');
    await expect(item).toContainText('passenger@example.kz');
    await expect(item).toHaveAttribute('data-read', 'false');

    await item.getByRole('button', { name: 'Mark read' }).click();
    await expect(
      page.locator('[data-testid="feedback-item"]', { hasText: message })
    ).toHaveAttribute('data-read', 'true');
  });

  test('renders a scripted message as text, not as script', async ({ page }) => {
    // The obvious attack on this panel: stored XSS through the public form,
    // triggered when staff open the inbox (plan §9.1).
    const payload = `<script>window.__xss = true;</script><img src=x onerror="window.__xss=true">`;
    const message = `${uniqueMessage('XSS')} ${payload}`;

    await page.goto(CONTACTS);
    await fillForm(page, message);
    await page.waitForTimeout(2100);
    await page.getByRole('button', { name: 'Отправить' }).click();
    await expect(page.getByRole('status')).toBeVisible();

    await page.goto('/admin/feedback');

    const item = page.locator('[data-testid="feedback-item"]', { hasText: 'XSS' });
    await expect(item).toHaveCount(1);
    // Shown verbatim as text …
    await expect(item).toContainText('<script>');
    // … and never executed or parsed into elements.
    await expect(item.locator('img')).toHaveCount(0);
    expect(
      await page.evaluate(() => (window as unknown as { __xss?: boolean }).__xss)
    ).toBeUndefined();
  });
});
