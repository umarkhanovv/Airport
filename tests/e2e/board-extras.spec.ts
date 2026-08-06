import { expect, test } from '@playwright/test';

/**
 * Board extras — Stage 4 (§17.2, §17.3, §11.2).
 *
 * The headline requirement is the weather one: with the provider failing, the
 * board must be *visually and functionally unchanged*. That is asserted by
 * comparing the board against itself with weather blocked, rather than by
 * trusting the try/catch.
 */

const BOARD = '/flights?view=week&kind=departures';

async function rowSnapshot(page: import('@playwright/test').Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-flight-row]')].map((row) => ({
      time: row.querySelector('.board-time')?.textContent?.trim().slice(0, 5) ?? '',
      city: row
        .querySelector('.board-city')
        ?.textContent?.trim()
        .replace(/\s*[☀⛅🌫🌧❄⛈].*$/u, ''),
      flight: row.querySelector('.board-flight')?.textContent?.trim() ?? '',
    }))
  );
}

test.describe('weather never affects the board', () => {
  test('the board is identical when the weather endpoint fails', async ({ page }) => {
    await page.goto(BOARD);
    await page.waitForLoadState('networkidle');
    const healthy = await rowSnapshot(page);
    expect(healthy.length).toBeGreaterThan(5);

    // Now break weather completely and reload.
    await page.route('**/api/weather**', (route) => route.abort('failed'));
    await page.goto(BOARD);
    await page.waitForLoadState('networkidle');
    const broken = await rowSnapshot(page);

    expect(broken).toEqual(healthy);
    await expect(page.locator('[data-flight-row]').first()).toBeVisible();
  });

  test('a hanging weather request does not delay the flight times', async ({ page }) => {
    // Never resolves — the worst case for anything that awaited it.
    await page.route('**/api/weather**', () => {});

    const started = Date.now();
    await page.goto(BOARD);
    await expect(page.locator('.board-time').first()).toHaveText(/\d{2}:\d{2}/);
    const elapsed = Date.now() - started;

    expect(elapsed, 'times must render without waiting on weather').toBeLessThan(10_000);
  });

  test('a malformed weather response is ignored', async ({ page }) => {
    await page.route('**/api/weather**', (route) =>
      route.fulfill({ status: 200, body: 'not json at all' })
    );

    await page.goto(BOARD);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('[data-flight-row]').first()).toBeVisible();
    await expect(page.locator('[data-weather]')).toHaveCount(0);
  });

  test('weather causes no uncaught errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.route('**/api/weather**', (route) => route.abort('failed'));
    await page.goto(BOARD);
    await page.waitForLoadState('networkidle');

    expect(errors).toEqual([]);
  });
});

test.describe('pinning', () => {
  test('pins a flight, moves it to the top, and remembers it', async ({ page }) => {
    await page.goto(BOARD);

    const rows = page.locator('[data-flight-row]');
    const target = rows.nth(3);
    const targetKey = await target.getAttribute('data-pin-key');
    expect(targetKey).toBeTruthy();

    await target.locator('[data-pin-toggle]').click();

    // It is now first, and marked as pressed rather than only coloured.
    await expect(rows.first()).toHaveAttribute('data-pin-key', targetKey!);
    await expect(rows.first().locator('[data-pin-toggle]')).toHaveAttribute('aria-pressed', 'true');

    // Survives a reload, with no account and no server round trip.
    await page.reload();
    await expect(rows.first()).toHaveAttribute('data-pin-key', targetKey!);
    await expect(rows.first()).toHaveAttribute('data-pinned', '');
  });

  test('unpins again', async ({ page }) => {
    await page.goto(BOARD);
    const rows = page.locator('[data-flight-row]');

    const key = await rows.nth(2).getAttribute('data-pin-key');
    await rows.nth(2).locator('[data-pin-toggle]').click();
    await expect(rows.first()).toHaveAttribute('data-pin-key', key!);

    await rows.first().locator('[data-pin-toggle]').click();
    await expect(page.locator('[data-pinned]')).toHaveCount(0);
  });

  test('a pinned row states its own date, since it has left its day heading', async ({ page }) => {
    await page.goto(BOARD);
    const rows = page.locator('[data-flight-row]');
    await rows.nth(5).locator('[data-pin-toggle]').click();

    // The date is exposed via a CSS ::after on the time cell.
    const label = await rows.first().locator('.board-time').getAttribute('data-date-label');
    expect(label).toBeTruthy();
    expect(label).toMatch(/2024/);
  });

  test('stores nothing but the pin list, and no personal data', async ({ page }) => {
    await page.goto(BOARD);
    await page.locator('[data-flight-row]').first().locator('[data-pin-toggle]').click();

    const stored = await page.evaluate(() => ({ ...localStorage }));
    expect(Object.keys(stored)).toContain('hsa-pinned-flights');

    const pins = JSON.parse(stored['hsa-pinned-flights']);
    expect(Array.isArray(pins)).toBe(true);
    // Only flight identity — nothing about the person.
    expect(pins[0]).toMatch(/^\d{4}-\d{2}-\d{2}\|(arrival|departure)\|/);
  });
});

test.describe('calendar export', () => {
  test('serves a valid .ics for a flight', async ({ page }) => {
    await page.goto(BOARD);

    const href = await page
      .locator('[data-flight-row]')
      .first()
      .locator('a[href*="/ics"]')
      .getAttribute('href');
    expect(href).toBeTruthy();

    const response = await page.request.get(href!);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/calendar');

    const body = await response.text();
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('BEGIN:VEVENT');
    expect(body).toMatch(/DTSTART:\d{8}T\d{6}Z/);
    expect(body).toContain('END:VCALENDAR');
  });

  test('the calendar link works without JavaScript', async ({ browser }) => {
    // A plain anchor, so someone with scripting off can still save the flight.
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(BOARD);

    const link = page.locator('[data-flight-row]').first().locator('a[href*="/ics"]');
    await expect(link).toHaveCount(1);

    // The pin and share controls, which cannot work, are hidden instead.
    await expect(page.locator('[data-pin-toggle]').first()).toBeHidden();
    await context.close();
  });

  test('returns 404 for an unknown flight rather than an empty calendar', async ({ page }) => {
    const response = await page.request.get('/api/flights/does-not-exist/ics');
    expect(response.status()).toBe(404);
  });
});
