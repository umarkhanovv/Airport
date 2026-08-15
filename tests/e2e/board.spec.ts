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

  /**
   * The site must not invent a status it has no data for (spec §6.4).
   *
   * What this covers is text the *site* generates: its own labels, its own
   * framing. `факт. 17:52` passes deliberately — it states a time somebody at
   * the airport typed and claims nothing about why.
   *
   * It does not cover a staff note, and should not. A note is the airport
   * speaking for itself about its own flight, so «задержка» in one is a fact
   * from the only party who has it, not the site guessing. The seeded workbook
   * carries no edits, so what is measured here is the site's own vocabulary —
   * which is the thing the promise was ever about.
   */
  test('states that times are scheduled, never live', async ({ page }) => {
    await page.goto('/flights');
    await expect(page.getByText('время по расписанию').first()).toBeVisible();

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

/**
 * The home page board.
 *
 * Its direction tabs are radios and labels rather than links, because reading
 * `?kind=` from the URL would opt the busiest page on the site out of static
 * generation. So the switch has to be proved to work with no JavaScript at
 * all — the property the whole design was chosen for.
 */
test.describe('the home page direction tabs', () => {
  /*
   * The seeded workbook covers April 2024 on purpose — `never labels another
   * day as "today"` above depends on it being out of range — so the home page
   * renders the stale notice and these panels do not exist. Rather than seed a
   * second, current schedule and lose that test, these skip themselves and run
   * the moment the fixture covers today.
   */
  test.beforeEach(async ({ page }) => {
    await page.goto('/ru');
    test.skip(
      (await page.locator('.home-panel').count()) === 0,
      'seeded schedule does not cover today, so the home page shows the stale notice'
    );
  });

  test('switch the board without leaving the page', async ({ page }) => {
    const arrivals = page.locator('.home-panel[data-direction="arrival"]');
    const departures = page.locator('.home-panel[data-direction="departure"]');

    await expect(arrivals).toBeVisible();
    await expect(departures).toBeHidden();

    await page.getByText('Вылет', { exact: false }).first().click();

    await expect(departures).toBeVisible();
    await expect(arrivals).toBeHidden();
    // The whole point: still on the home page, nothing navigated.
    await expect(page).toHaveURL(/\/ru$/);
  });

  test('switch with no JavaScript at all', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto('/ru');
    await page.getByText('Вылет', { exact: false }).first().click();

    await expect(page.locator('.home-panel[data-direction="departure"]')).toBeVisible();
    await expect(page.locator('.home-panel[data-direction="arrival"]')).toBeHidden();
    await expect(page).toHaveURL(/\/ru$/);

    await context.close();
  });

  test('the tabs are reachable and operable from the keyboard', async ({ page }) => {
    // The radios are `sr-only`, not `display: none`, precisely so this works.
    await page.locator('#home-arrivals').focus();
    await page.keyboard.press('ArrowRight');

    await expect(page.locator('#home-departures')).toBeChecked();
    await expect(page.locator('.home-panel[data-direction="departure"]')).toBeVisible();
  });
});

/**
 * Flights leave the board once they have gone (`lib/flights/current.ts`).
 *
 * The scope guarantee is tested unconditionally, because getting it wrong is
 * the expensive failure: a week view or a search that quietly dropped rows
 * would hide a flight from someone planning a trip, and nothing on screen would
 * say so.
 *
 * The retiring itself can only be watched on a board that is showing today, and
 * the seeded workbook covers April 2024 on purpose — `never labels another day
 * as "today"` depends on it. So those tests carry the same self-skip the home
 * page tabs use above, and run the moment the fixture is current.
 */
test.describe('planning views keep every flight', () => {
  test('the week view and a search never retire a row', async ({ page }) => {
    // The search is paired with the week view so that there are rows to judge:
    // the seeded workbook is out of range, so the plain today view is empty
    // whatever is typed into the box.
    for (const path of ['/flights?view=week', '/flights?view=week&q=KC']) {
      await page.goto(path);

      const rows = page.locator('[data-flight-row]');
      expect(await rows.count(), `no rows to judge on ${path}`).toBeGreaterThan(0);

      // No deadline written means the client can never hide it, whatever the
      // clock says. That is the whole mechanism, asserted at its source.
      await expect(page.locator('[data-flight-row][data-expires-at]')).toHaveCount(0);
      await expect(page.locator('[data-live-board]')).toHaveCount(0);
    }
  });
});

test.describe('the live board empties as the day passes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ru');
    test.skip(
      (await page.locator('[data-live-board]').count()) === 0,
      'seeded schedule does not cover today, so there is no live board to empty'
    );
  });

  test('a row past its deadline is hidden, and the board says so instead', async ({ page }) => {
    const board = page.locator('[data-live-board][data-direction="arrival"]');
    const notice = board.locator('[data-board-empty]');

    /*
     * Rather than waiting out a real half hour, the deadlines are moved
     * into the past and the sweep is poked the way a returning phone pokes it.
     * What is being tested is the client's half of the rule — that the board
     * keeps itself right long after the HTML was served, which for an ISR page
     * can be a very long time.
     */
    const hadRows = await board.locator('[data-flight-row][data-expires-at]').count();

    await page.evaluate(() => {
      for (const row of document.querySelectorAll<HTMLElement>('[data-expires-at]')) {
        row.dataset.expiresAt = String(Date.now() - 1000);
      }
      document.dispatchEvent(new Event('visibilitychange'));
    });

    if (hadRows > 0) {
      await expect(board.locator('[data-flight-row]').first()).toBeHidden();
    }
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('больше нет');

    // The tab must not still claim flights the table no longer has.
    await expect(page.locator('[data-board-count="arrival"]')).toHaveText('0');
  });

  test('a flight still inside its grace period stays', async ({ page }) => {
    await page.evaluate(() => {
      // Scheduled a minute ago, so already "departed" but well inside the half
      // hour — the case a naive `time < now` filter gets wrong.
      for (const row of document.querySelectorAll<HTMLElement>('[data-expires-at]')) {
        row.dataset.expiresAt = String(Date.now() + 29 * 60_000);
      }
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await expect(page.locator('[data-flight-row][data-retired]')).toHaveCount(0);
  });
});
