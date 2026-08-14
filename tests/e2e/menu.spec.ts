import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * The header menu (spec §5).
 *
 * It reproduces the legacy site's structure at the airport's request, so the
 * thing worth testing is not that a panel opens — it is that the panel opens
 * for everybody. It is built on `<details>` precisely so that it works with no
 * JavaScript, on a phone, and from the keyboard; a menu that quietly needs a
 * script is a site that cannot be navigated on a bad connection.
 *
 * There are two menus now, and they are separate components: a row of tabs
 * dropping full-width panels from `md` up, and a hamburger opening a vertical
 * accordion below it. Both ship in the HTML at every width — one is always
 * `display: none` — so **every locator here has to be scoped to one of them**.
 * An unscoped `getByText('Пассажирам')` matches both and fails strict mode,
 * which is the correct outcome: it is genuinely ambiguous.
 *
 * The no-JavaScript promise is asserted against both. The phone menu is the one
 * most likely to be met on a weak connection, so it is the last place that may
 * quietly require a script.
 */

const TOP_LEVEL = ['Табло', 'Новости', 'Пассажирам', 'Партнёрам', 'Пресс-центр', 'Обратная связь'];

/** Playwright's default viewport is desktop-width; the phone tests opt out. */
const PHONE = { width: 375, height: 812 };

const desktopNav = (page: Page) => page.getByTestId('nav-desktop');
const mobileNav = (page: Page) => page.getByTestId('nav-mobile');

/**
 * A top-level entry: the `<summary>` that opens a panel, or the plain link.
 *
 * Scoped to the row classes rather than to `summary, a`, and that is not
 * fussiness. "Пресс-центр" names three different things in the phone menu now —
 * the section, the one group inside it, and nothing else that reads the same —
 * so an element-level lookup matches a section summary and a group summary at
 * once and fails strict mode. The classes say which level is meant.
 */
function entry(nav: Locator, label: string) {
  return nav
    .locator('summary.menu-summary, summary.nav-row, a.menu-item, a.nav-row')
    .filter({ hasText: new RegExp(`^${label}$`) });
}

/** A group inside an opened section — the third level, phone only. */
function group(nav: Locator, label: string) {
  return nav.locator('summary.nav-group-row').filter({ hasText: new RegExp(`^${label}$`) });
}

/**
 * The `<details>` a top-level entry opens.
 *
 * Matched on `[name]`, which every panel and every phone branch carries for the
 * exclusive-accordion behaviour — and which the drawer's own outer `<details>`
 * does not, so the wrapper is not mistaken for the branch inside it.
 */
function branch(nav: Locator, page: Page, label: string) {
  return nav.locator('details[name]', { has: page.getByText(label, { exact: true }) });
}

/** The phone menu is behind the hamburger; nothing in it is reachable until. */
async function openDrawer(page: Page) {
  await mobileNav(page).locator('summary.nav-toggle').click();
  await expect(page.getByTestId('nav-drawer')).toBeVisible();
}

test.describe('the header menu', () => {
  test('shows the six destinations the airport asked for', async ({ page }) => {
    await page.goto('/ru');

    for (const label of TOP_LEVEL) {
      await expect(entry(desktopNav(page), label)).toBeVisible();
    }
  });

  test('keeps its panels shut until they are asked for', async ({ page }) => {
    await page.goto('/ru');

    // A link inside a closed panel is not reachable — by a visitor or a tab key.
    await expect(
      desktopNav(page).getByRole('link', { name: 'Комната матери и ребёнка' })
    ).toBeHidden();
  });

  test('opens a panel, with the groups the legacy site had', async ({ page }) => {
    await page.goto('/ru');
    const nav = desktopNav(page);
    await entry(nav, 'Пассажирам').click();

    const panel = branch(nav, page, 'Пассажирам').getByTestId('menu-panel');
    for (const group of ['В аэропорту', 'Вылетающим', 'Прибывшим', 'Информация по рейсам']) {
      await expect(panel.getByRole('heading', { name: group })).toBeVisible();
    }

    await expect(panel.getByRole('link', { name: 'Комната матери и ребёнка' })).toBeVisible();
  });

  test('the open panel is opaque, so the page does not read through it', async ({ page }) => {
    // It used to be `.glass-strong` — 85% opaque over a live backdrop — and the
    // page showed through the one surface that has to sit in front of it.
    await page.goto('/ru');
    const nav = desktopNav(page);
    await entry(nav, 'Пассажирам').click();

    const background = await branch(nav, page, 'Пассажирам')
      .getByTestId('menu-panel')
      .evaluate((node) => getComputedStyle(node).backgroundColor);

    // No fractional alpha channel: `rgb(…)`, or `rgba(…, 1)`.
    expect(background).not.toMatch(/rgba?\([^)]*,\s*0?\.\d+\s*\)/);
  });

  test('opening one panel closes the other', async ({ page }) => {
    await page.goto('/ru');
    const nav = desktopNav(page);

    await entry(nav, 'Пассажирам').click();
    await expect(branch(nav, page, 'Пассажирам')).toHaveAttribute('open', '');

    await entry(nav, 'Партнёрам').click();
    await expect(branch(nav, page, 'Партнёрам')).toHaveAttribute('open', '');
    await expect(branch(nav, page, 'Пассажирам')).not.toHaveAttribute('open', '');
  });

  test('its links lead where they say', async ({ page }) => {
    await page.goto('/ru');
    const nav = desktopNav(page);
    await entry(nav, 'Пассажирам').click();
    await nav.getByRole('link', { name: 'Розыск багажа' }).click();

    // Asserted on the destination, not the prefix: next-intl serves the default
    // language both with and without one.
    await expect(page).toHaveURL(/\/passengers\/baggage-tracing$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('one link back to the full board, where two used to be', async ({ page }) => {
    // Вылет and Прилёт left the menu when today's flights moved onto the home
    // page. What the menu still owes is a way to the week view and the search.
    await page.goto('/ru');

    const board = desktopNav(page).getByRole('link', { name: 'Табло', exact: true });
    await expect(board).toHaveAttribute('href', '/flights');

    await board.click();
    await expect(page).toHaveURL(/\/flights$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('every panel also opens onto its own section index', async ({ page }) => {
    // The menu predates a fifth of the content tree; without this those pages
    // would be reachable only by someone who already knew they existed.
    await page.goto('/ru');
    const nav = desktopNav(page);

    // The locale prefix is added by next-intl's routing rather than written
    // into the rendered href, so the assertion is about the destination.
    for (const [label, href] of [
      ['Пассажирам', '/passengers'],
      ['Партнёрам', '/partners'],
      ['Пресс-центр', '/press'],
    ] as const) {
      await entry(nav, label).click();
      const link = branch(nav, page, label).getByRole('link', { name: 'Все страницы раздела' });
      await expect(link).toHaveAttribute('href', href);
    }
  });

  test('works with no JavaScript at all', async ({ browser }) => {
    // The property the whole `<details>` design exists for.
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto('/ru');
    const nav = desktopNav(page);
    await entry(nav, 'Партнёрам').click();

    const link = nav.getByRole('link', { name: 'Сезонное расписание' });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/flights\/statistics$/);

    await context.close();
  });

  test('opens from the keyboard and says whether it is open', async ({ page }) => {
    await page.goto('/ru');

    const summary = desktopNav(page).locator('summary').first();
    await summary.focus();
    await page.keyboard.press('Enter');

    await expect(branch(desktopNav(page), page, 'Пассажирам')).toHaveAttribute('open', '');
    // `<details>` carries this itself, which is the reason for using it.
    expect(await summary.evaluate((node) => node.getAttribute('aria-expanded'))).not.toBe('false');
  });

  test('an open panel is accessible', async ({ page }) => {
    await page.goto('/ru');
    await entry(desktopNav(page), 'Пассажирам').click();

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const blocking = results.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious'
    );

    expect(blocking.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});

test.describe('the menu on a phone', () => {
  test.use({ viewport: PHONE });

  test('is folded behind three lines until it is asked for', async ({ page }) => {
    await page.goto('/ru');

    // The complaint this answers: the desktop row rendered at every width, so
    // the menu was on screen in full before anybody asked for it.
    await expect(desktopNav(page)).toBeHidden();
    await expect(page.getByTestId('nav-drawer')).toBeHidden();

    await openDrawer(page);
    await expect(entry(mobileNav(page), 'Пассажирам')).toBeVisible();
  });

  test('opens one branch at a time', async ({ page }) => {
    // The other half of the complaint: everything expanded at once, a thousand
    // pixels of menu above the page you came to read.
    await page.goto('/ru');
    await openDrawer(page);
    const nav = mobileNav(page);

    await entry(nav, 'Пассажирам').click();
    await expect(branch(nav, page, 'Пассажирам')).toHaveAttribute('open', '');

    // The third level: a section opens onto its groups, not onto every link it
    // has. Eighteen links used to arrive at once here.
    await expect(nav.getByRole('link', { name: 'Комната матери и ребёнка' })).toBeHidden();
    await group(nav, 'В аэропорту').click();
    await expect(nav.getByRole('link', { name: 'Комната матери и ребёнка' })).toBeVisible();

    await entry(nav, 'Партнёрам').click();
    await expect(branch(nav, page, 'Партнёрам')).toHaveAttribute('open', '');
    await expect(branch(nav, page, 'Пассажирам')).not.toHaveAttribute('open', '');
  });

  test('its links lead where they say', async ({ page }) => {
    await page.goto('/ru');
    await openDrawer(page);
    const nav = mobileNav(page);

    await entry(nav, 'Пассажирам').click();
    await group(nav, 'Прибывшим').click();
    await nav.getByRole('link', { name: 'Розыск багажа' }).click();

    await expect(page).toHaveURL(/\/passengers\/baggage-tracing$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('the whole tree works with no JavaScript at all', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: PHONE });
    const page = await context.newPage();

    await page.goto('/ru');
    const nav = mobileNav(page);
    await nav.locator('summary.nav-toggle').click();
    await entry(nav, 'Партнёрам').click();
    await group(nav, 'Закупки').click();

    const link = nav.getByRole('link', { name: 'Сезонное расписание' });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/flights\/statistics$/);

    await context.close();
  });

  test('fits the screen without pushing the page sideways', async ({ page }) => {
    await page.goto('/ru');
    await openDrawer(page);
    await entry(mobileNav(page), 'Пассажирам').click();
    // The deepest indent is what has to fit, so measure with a group open.
    await group(mobileNav(page), 'В аэропорту').click();

    const overflow = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="nav-drawer"]')!;
      return panel.getBoundingClientRect().right - window.innerWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1);

    // And it scrolls inside itself rather than growing the document.
    const documentOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(documentOverflow).toBeLessThanOrEqual(1);
  });

  test('an open drawer is accessible', async ({ page }) => {
    await page.goto('/ru');
    await openDrawer(page);
    await entry(mobileNav(page), 'Пассажирам').click();
    await group(mobileNav(page), 'В аэропорту').click();

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const blocking = results.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious'
    );

    expect(blocking.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});

test.describe('the language button', () => {
  test('one button, naming the language you are reading', async ({ page }) => {
    await page.goto('/ru');

    const switcher = page.getByRole('navigation', { name: 'Язык' });
    await expect(switcher.getByText('RU', { exact: true })).toBeVisible();
    // The other two are behind it, not printed beside it.
    await expect(switcher.getByRole('link')).toHaveCount(0);
  });

  test('offers the other two and keeps you on the same page', async ({ page }) => {
    await page.goto('/ru/passengers/baggage-tracing');

    const switcher = page.getByRole('navigation', { name: 'Язык' });
    await switcher.locator('summary').click();

    await expect(switcher.getByRole('link', { name: 'English' })).toBeVisible();
    await switcher.getByRole('link', { name: 'Қазақша' }).click();

    // Kazakh is served under /kz, and the page you were on is the page you get.
    await expect(page).toHaveURL(/\/kz\/passengers\/baggage-tracing$/);
  });

  test('switches language with no JavaScript', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto('/ru');
    const switcher = page.getByRole('navigation', { name: 'Язык' });
    await switcher.locator('summary').click();
    await switcher.getByRole('link', { name: 'English' }).click();

    await expect(page).toHaveURL(/\/en$/);
    await context.close();
  });
});
