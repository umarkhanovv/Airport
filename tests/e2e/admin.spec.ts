import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

/**
 * Admin panel — Stage 6 (spec §8, plan §5.8, §5.9, §9.1).
 *
 * The stage's exit criteria, asserted end to end against the standalone bundle:
 * the real sample file completes upload → preview → publish; a bad file is
 * rejected with a readable message; a failed upload leaves the previous
 * schedule intact.
 */

/*
 * The whole file, serially.
 *
 * Every describe below writes the same global state: there is exactly one
 * active schedule in the database, and several of these tests change which one
 * it is. Marking the individual blocks serial was not enough — two serial
 * describes still interleave across workers, so `take off the board` could
 * clear the board and another block publish a schedule back before the
 * assertion ran. That failed roughly one run in three and looked like a bug in
 * the download route.
 */
test.describe.configure({ mode: 'serial' });

const PASSWORD = 'e2e-admin-password';
// Playwright's TS transform is CommonJS, so `__dirname` is available here and
// `import.meta` is not — the reverse of the Vitest suites.
const SAMPLE = path.resolve(__dirname, '../../data/sample_weekly_schedule.xlsx');

/** The golden fixture: this exact file is 38 entries, 7 days, 1 warning (plan §5.6). */
const EXPECTED = { flights: '38', days: '7', warnings: 1 };

async function signIn(page: Page) {
  await page.goto('/admin/login');
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
}

test.describe('access control', () => {
  test('an unauthenticated visit to /admin lands on the login screen', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByRole('heading', { name: 'Airport admin' })).toBeVisible();
  });

  test('the upload screen is not reachable without signing in', async ({ page }) => {
    await page.goto('/admin/schedule');
    await expect(page).toHaveURL(/\/admin\/login/);
    // The path is preserved so login returns the staff member where they meant to go.
    expect(new URL(page.url()).searchParams.get('next')).toBe('/admin/schedule');
  });

  test('a wrong password is refused and sets no session', async ({ page }) => {
    await page.goto('/admin/login');
    await page.locator('#password').fill('not the password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Targeted by id, not by role: Next renders its own aria-live route
    // announcer with role="alert", so getByRole('alert') is ambiguous here.
    await expect(page.locator('#login-error')).toHaveText(/Incorrect password/);

    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === 'hsa_admin')).toBeUndefined();
  });

  test('the session cookie is httpOnly, so script cannot read it', async ({ page }) => {
    await signIn(page);

    const cookie = (await page.context().cookies()).find((c) => c.name === 'hsa_admin');
    expect(cookie).toBeDefined();
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe('Lax');

    await expect(page.evaluate(() => document.cookie)).resolves.not.toContain('hsa_admin');
  });

  test('admin is not localised — /admin is never rewritten to a locale', async ({ page }) => {
    // The property that matters: the proxy matcher excludes /admin, so
    // next-intl leaves it alone. Without that exclusion /admin would be
    // redirected to /ru/admin and every admin URL would 404.
    await page.goto('/admin');
    expect(page.url()).not.toMatch(/\/(ru|en|kz|kk)\/admin/);
    await expect(page).toHaveURL(/\/admin(\/login)?/);

    // A locale-prefixed admin URL does not serve the panel either: it leaves
    // the locale tree entirely and lands on the unauthenticated login screen.
    await page.goto('/ru/admin');
    expect(page.url()).not.toMatch(/\/(ru|en|kz|kk)\/admin/);
    await expect(page.getByRole('heading', { name: 'Overview' })).toHaveCount(0);
  });

  test('robots.txt disallows the admin tree', async ({ page }) => {
    const body = await (await page.request.get('/robots.txt')).text();
    expect(body).toMatch(/Disallow:\s*\/admin/);
  });

  test('signing out clears the session', async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: 'Sign out' }).click();

    await expect(page).toHaveURL(/\/admin\/login/);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});

test.describe('upload rejection', () => {
  test('a file that is not really a workbook is refused with a readable message', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/admin/schedule');

    // Named .xlsx, but it is HTML. Extension and MIME are client-supplied; the
    // magic bytes are not.
    await page.locator('#file').setInputFiles({
      name: 'week.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('<!doctype html><html>not a workbook</html>', 'utf8'),
    });
    await page.getByRole('button', { name: 'Upload and preview' }).click();

    await expect(page.locator('#upload-error')).toHaveText(/not an \.xlsx workbook/);
    // Still on the upload screen; nothing was staged or published.
    await expect(page).toHaveURL(/\/admin\/schedule$/);
  });

  test('a rejected upload leaves the live schedule untouched', async ({ page }) => {
    await signIn(page);
    const before = await page.getByTestId('live-flights').textContent();

    await page.goto('/admin/schedule');
    await page.locator('#file').setInputFiles({
      name: 'broken.xlsx',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('%PDF-1.7 this is a pdf', 'utf8'),
    });
    await page.getByRole('button', { name: 'Upload and preview' }).click();
    await expect(page.locator('#upload-error')).toBeVisible();

    await page.goto('/admin');
    await expect(page.getByTestId('live-flights')).toHaveText(before!);
  });
});

/**
 * Serial: these publish a schedule, which is global state. The workbook is the
 * same one `e2e:seed` imported, so the board's contents are unchanged either
 * way — but two publishes racing each other would still be a pointless flake.
 */
test.describe('upload to publish', () => {
  test.describe.configure({ mode: 'serial' });

  test('the real sample file previews as 38 flights over 7 days with one warning', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/admin/schedule');

    await page.locator('#file').setInputFiles(SAMPLE);
    await page.getByRole('button', { name: 'Upload and preview' }).click();

    await expect(page.getByRole('heading', { name: 'Preview' })).toBeVisible();
    await expect(page.getByTestId('preview-flights')).toHaveText(EXPECTED.flights);
    await expect(page.getByTestId('preview-days')).toHaveText(EXPECTED.days);

    // The documented single warning: the RMD header is missing and was assumed
    // by column position (plan §1.1, §5.3).
    await expect(page.getByTestId('preview-errors')).toHaveCount(0);
    await expect(page.getByTestId('preview-warnings').locator('li')).toHaveCount(EXPECTED.warnings);
    await expect(page.locator('[data-diagnostic="header-assumed-by-position"]')).toBeVisible();
  });

  test('preview publishes nothing until it is confirmed', async ({ page }) => {
    await signIn(page);
    await page.goto('/admin/schedule');
    await page.locator('#file').setInputFiles(SAMPLE);
    await page.getByRole('button', { name: 'Upload and preview' }).click();
    await expect(page.getByRole('heading', { name: 'Preview' })).toBeVisible();

    await expect(page.getByText(/Nothing has been published/)).toBeVisible();

    // Walking away leaves the board exactly as it was.
    await page.goto('/admin');
    await expect(page.getByTestId('live-flights')).toHaveText(EXPECTED.flights);
  });

  test('confirming publishes the schedule to the public board', async ({ page }) => {
    await signIn(page);
    await page.goto('/admin/schedule');
    await page.locator('#file').setInputFiles(SAMPLE);
    await page.getByRole('button', { name: 'Upload and preview' }).click();

    await page.getByRole('button', { name: 'Publish to the public board' }).click();

    await expect(page).toHaveURL(/\/admin\?published=1/);
    await expect(page.getByRole('status')).toHaveText(/Schedule published/);
    await expect(page.getByTestId('live-flights')).toHaveText(EXPECTED.flights);

    // Exactly one upload is live, and the history records the rest.
    await expect(page.getByText('live', { exact: true })).toHaveCount(1);

    // The public board renders the published data.
    await page.goto('/flights?view=week&kind=departures');
    await expect(page.locator('[data-flight-row]').first()).toBeVisible();
  });

  test('discarding a preview removes it without publishing', async ({ page }) => {
    await signIn(page);
    await page.goto('/admin/schedule');
    await page.locator('#file').setInputFiles(SAMPLE);
    await page.getByRole('button', { name: 'Upload and preview' }).click();

    const previewUrl = page.url();
    await page.getByRole('button', { name: 'Discard' }).click();
    await expect(page).toHaveURL(/\/admin\/schedule$/);

    // The staged file is gone, so its preview no longer renders. Asserted by
    // navigating rather than by raw status: Next serves its not-found page
    // through a redirect, so the status code is not the interesting part.
    await page.goto(previewUrl);
    await expect(page.getByRole('heading', { name: 'Preview' })).toHaveCount(0);
  });
});

test.describe('staged upload ids', () => {
  test('a path-traversal id is a 404, not a file read', async ({ page }) => {
    await signIn(page);

    for (const evil of ['..%2f..%2f..%2fetc%2fpasswd', 'not-a-uuid', '..']) {
      await page.goto(`/admin/schedule/${evil}`);

      // Whatever Next does with the path — normalise, redirect, 404 — the one
      // thing that must never happen is a preview rendered from it.
      await expect(
        page.getByRole('heading', { name: 'Preview' }),
        `${evil} must not be served`
      ).toHaveCount(0);
      await expect(page.getByTestId('preview-flights')).toHaveCount(0);
    }
  });
});

/**
 * Choosing and removing schedules (wave 2).
 *
 * Serial, and for a sharper reason than the publish tests above: these change
 * which schedule the public board is showing, and one of them deletes rows
 * outright. Each test restores what it changed so the rest of the suite still
 * sees a published schedule.
 */
test.describe('schedule controls', () => {
  test.describe.configure({ mode: 'serial' });

  /** The history table row for a given week, by its start date. */
  const rowFor = (page: Page, week: string) => page.locator('tbody tr').filter({ hasText: week });

  test('publishes another schedule so there is more than one to choose between', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/admin');
    const before = await page.locator('tbody tr').count();

    await page.goto('/admin/schedule');
    await page.locator('#file').setInputFiles(SAMPLE);
    await page.getByRole('button', { name: 'Upload and preview' }).click();
    await page.getByRole('button', { name: /Publish/ }).click();

    await expect(page).toHaveURL(/\/admin\?published=1/);
    // Relative, not absolute: earlier blocks in this file publish too, and the
    // seed leaves one behind. Only the delta is this test's business.
    await expect(page.locator('tbody tr')).toHaveCount(before + 1);
    // Exactly one is live, and it is the newest.
    await expect(page.getByText('live', { exact: true })).toHaveCount(1);
  });

  test('takes the live schedule off the board, leaving nothing live', async ({ page }) => {
    await signIn(page);
    await page.goto('/admin');

    await page.getByRole('button', { name: 'Take off the board' }).click();

    await expect(page).toHaveURL(/schedule=cleared/);
    await expect(page.getByText('live', { exact: true })).toHaveCount(0);
    // Every upload survives — this is the reversible half.
    expect(await page.locator('tbody tr').count()).toBeGreaterThan(1);

    // The public board says so rather than showing a stale week.
    await page.goto('/ru/flights');
    await expect(page.getByText('Расписание пока не загружено')).toBeVisible();

    // And the download has nothing to serve.
    expect((await page.request.get('/api/schedule/download')).status()).toBe(404);
  });

  test('puts a chosen schedule back on the board', async ({ page }) => {
    await signIn(page);
    await page.goto('/admin');

    await page.getByRole('button', { name: 'Make live' }).first().click();

    await expect(page).toHaveURL(/schedule=live/);
    await expect(page.getByText('live', { exact: true })).toHaveCount(1);

    await page.goto('/ru/flights');
    await expect(page.locator('[data-flight-row]').first()).toBeVisible();
  });

  test('refuses to delete when the typed week does not match', async ({ page }) => {
    await signIn(page);
    await page.goto('/admin');

    const before = await page.locator('tbody tr').count();

    const row = rowFor(page, '2024-04-01').first();
    await row.getByPlaceholder('2024-04-01').fill('not-the-week');
    await row.getByRole('button', { name: 'Delete' }).click();

    await expect(page).toHaveURL(/schedule=mismatch/);
    // Scoped to the row: Next's route announcer is also `role="alert"`.
    await expect(rowFor(page, '2024-04-01').first().getByRole('alert')).toContainText(
      'Nothing was deleted'
    );
    expect(await page.locator('tbody tr').count()).toBe(before);
  });

  test('deletes a schedule once its week is typed back', async ({ page }) => {
    await signIn(page);
    await page.goto('/admin');

    const before = await page.locator('tbody tr').count();

    // Delete a schedule that is not live, so the board is untouched by it.
    const row = page
      .locator('tbody tr')
      .filter({ hasNot: page.getByText('live', { exact: true }) })
      .first();
    await row.getByRole('textbox').fill('2024-04-01');
    await row.getByRole('button', { name: 'Delete' }).click();

    await expect(page).toHaveURL(/schedule=deleted/);
    await expect(page.locator('tbody tr')).toHaveCount(before - 1);

    // The live schedule is still live and the board still renders.
    await expect(page.getByText('live', { exact: true })).toHaveCount(1);
    await page.goto('/ru/flights');
    await expect(page.locator('[data-flight-row]').first()).toBeVisible();
  });

  test('the controls work with no JavaScript at all', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await signIn(page);
    await page.goto('/admin');

    await page.getByRole('button', { name: 'Take off the board' }).click();
    await expect(page).toHaveURL(/schedule=cleared/);

    await page.getByRole('button', { name: 'Make live' }).first().click();
    await expect(page).toHaveURL(/schedule=live/);
    await expect(page.getByText('live', { exact: true })).toHaveCount(1);

    await context.close();
  });
});
