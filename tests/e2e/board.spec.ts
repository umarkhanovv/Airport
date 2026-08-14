import { expect, test } from '@playwright/test';

/**
 * Flight board — Stage 3 exit criteria.
 *
 * The board is the reason this site exists. Its non-negotiable property is
 * that it works without JavaScript: the audience is on weak phones and bad
 * connections, and someone must be able to read a departure time on a device
 * that never finishes executing a bundle.
 */

test.describe('renders without JavaScript', () => {
  // A separate context with scripting off entirely — not merely "before
  // hydration", but a browser that will never run any of it.
  test.use({ javaScriptEnabled: false });

  test('the board shows flights with scripting disabled', async ({ page }) => {
    await page.goto('/flights?view=week');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const rows = page.locator('[data-flight-row]');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(5);

    // Times must be real text, not placeholders waiting on a fetch.
    await expect(page.locator('.board-time').first()).toHaveText(/^\d{2}:\d{2}$/);
  });

  test('tabs and filters are links that work without scripting', async ({ page }) => {
    await page.goto('/flights?view=week');
    // Scoped to the body: the home page board has its own direction tabs.
    const main = page.getByRole('main');

    await main.getByRole('link', { name: /Вылет/ }).click();
    await expect(page).toHaveURL(/kind=departures/);
    await expect(page.locator('[data-flight-row]').first()).toBeVisible();

    // Column header flips from "From" to "To" with the direction.
    await expect(page.locator('th[scope="col"]').nth(1)).toHaveText('Куда');
  });

  test('the DOM/INT filter works without scripting', async ({ page }) => {
    await page.goto('/flights?view=week&kind=departures');
    const all = await page.locator('[data-flight-row]').count();

    await page.getByRole('link', { name: 'Международный', exact: true }).click();
    await expect(page).toHaveURL(/type=int/);

    const international = await page.locator('[data-flight-row]').count();
    expect(international).toBeGreaterThan(0);
    expect(international).toBeLessThan(all);
  });

  test('search degrades to a GET form with a submit button', async ({ page }) => {
    await page.goto('/flights?view=week');

    // The button only exists when JavaScript has not removed it.
    await expect(page.getByRole('button', { name: 'Найти' })).toBeVisible();

    await page.getByRole('searchbox').fill('Алматы');
    await page.getByRole('button', { name: 'Найти' }).click();

    await expect(page).toHaveURL(/q=/);
    const rows = page.locator('[data-flight-row]');
    expect(await rows.count()).toBeGreaterThan(0);
    for (const cell of await page.locator('.board-city').allTextContents()) {
      expect(cell).toContain('Алматы');
    }
  });
});

test.describe('search with JavaScript', () => {
  test('filters instantly without a reload', async ({ page }) => {
    await page.goto('/flights?view=week&kind=departures');

    const rows = page.locator('[data-flight-row]');
    const before = await rows.count();
    expect(before).toBeGreaterThan(5);

    // If a navigation happens, this listener catches it.
    let navigated = false;
    page.on('framenavigated', () => {
      navigated = true;
    });

    await page.getByRole('searchbox').fill('алматы');
    await expect(rows.locator('visible=true')).toHaveCount(3);

    expect(navigated, 'search must not trigger a page load').toBe(false);
    await expect(page).toHaveURL(/view=week/);
    await expect(page).not.toHaveURL(/q=/);
  });

  test('matches a flight number regardless of the space in it', async ({ page }) => {
    await page.goto('/flights?view=week&kind=departures');
    const rows = page.locator('[data-flight-row]');

    await page.getByRole('searchbox').fill('kc7164');
    const withoutSpace = await rows.locator('visible=true').count();

    await page.getByRole('searchbox').fill('KC 7164');
    const withSpace = await rows.locator('visible=true').count();

    expect(withoutSpace).toBeGreaterThan(0);
    expect(withSpace).toBe(withoutSpace);
  });

  test('announces the result count and reports finding nothing', async ({ page }) => {
    await page.goto('/flights?view=week');
    const live = page.locator('[aria-live="polite"]');

    await page.getByRole('searchbox').fill('zzzznotaflight');
    await expect(live).toHaveText('Ничего не найдено');
    await expect(page.locator('[data-flight-row]').locator('visible=true')).toHaveCount(0);

    await page.getByRole('searchbox').fill('');
    await expect(live).toHaveText('');
  });
});

test.describe('board semantics and state', () => {
  test('is a real table with column headers, even on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/flights?view=week');

    // The rows are restyled into cards at this width; the roles must survive.
    await expect(page.locator('table.board')).toHaveAttribute('role', 'table');
    await expect(page.locator('[data-flight-row]').first()).toHaveAttribute('role', 'row');
    await expect(page.locator('th[scope="col"]').first()).toHaveAttribute('role', 'columnheader');

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflows, 'the board must not scroll sideways on a phone').toBe(false);
  });

  test('never labels another day as "today" when the schedule is out of range', async ({
    page,
  }) => {
    // The sample schedule covers April 2024, so today is never in range.
    await page.goto('/flights');

    const body = await page.locator('main').textContent();
    expect(body).toContain('2024');

    // The stale notice must be present, and no row may sit under a "Today"
    // heading — that is how someone arrives at the airport on the wrong day.
    const heading = page.locator('main').getByText('Сегодня ·');
    await expect(heading).toHaveCount(0);
  });

  test('states that times are scheduled, never live', async ({ page }) => {
    await page.goto('/flights');
    await expect(page.getByText('время по расписанию').first()).toBeVisible();

    // No status vocabulary anywhere: we have no data for it (spec §6.4).
    const text = (await page.locator('main').textContent())?.toLowerCase() ?? '';
    for (const forbidden of ['задерж', 'прибыл', 'отменён', 'delayed', 'landed']) {
      expect(text, `board must not claim "${forbidden}"`).not.toContain(forbidden);
    }
  });

  test('serves the original workbook for download', async ({ page }) => {
    const response = await page.request.get('/api/schedule/download');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('spreadsheetml');
    expect(response.headers()['content-disposition']).toContain('attachment');

    // A real xlsx is a zip: PK\x03\x04.
    const body = await response.body();
    expect([body[0], body[1], body[2], body[3]]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });
});
