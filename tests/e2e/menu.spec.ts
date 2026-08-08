import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * The header menu (spec §5).
 *
 * It reproduces the legacy site's structure at the airport's request, so the
 * thing worth testing is not that a panel opens — it is that the panel opens
 * for everybody. It is built on `<details>` precisely so that it works with no
 * JavaScript, on a phone, and from the keyboard; a menu that quietly needs a
 * script is a site that cannot be navigated on a bad connection.
 */

const TOP_LEVEL = ['Вылет', 'Прилёт', 'Пассажирам', 'Партнёрам', 'Пресс-центр', 'Обратная связь'];

function panelFor(page: Page, label: string) {
  return page.locator('header details', { has: page.getByText(label, { exact: true }) });
}

test.describe('the header menu', () => {
  test('shows the six destinations the airport asked for', async ({ page }) => {
    await page.goto('/ru');

    const header = page.getByRole('banner');
    for (const label of TOP_LEVEL) {
      await expect(header.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test('keeps its panels shut until they are asked for', async ({ page }) => {
    await page.goto('/ru');

    // A link inside a closed panel is not reachable — by a visitor or a tab key.
    await expect(page.getByRole('link', { name: 'Комната матери и ребёнка' })).toBeHidden();
  });

  test('opens a panel, with the groups the legacy site had', async ({ page }) => {
    await page.goto('/ru');
    await page.getByText('Пассажирам', { exact: true }).first().click();

    const panel = panelFor(page, 'Пассажирам').locator('[data-testid="menu-panel"]');
    for (const group of ['В аэропорту', 'Вылетающим', 'Прибывшим', 'Информация по рейсам']) {
      await expect(panel.getByRole('heading', { name: group })).toBeVisible();
    }

    await expect(panel.getByRole('link', { name: 'Комната матери и ребёнка' })).toBeVisible();
  });

  test('opening one panel closes the other', async ({ page }) => {
    await page.goto('/ru');

    await page.getByText('Пассажирам', { exact: true }).first().click();
    await expect(panelFor(page, 'Пассажирам')).toHaveAttribute('open', '');

    await page.getByText('Партнёрам', { exact: true }).first().click();
    await expect(panelFor(page, 'Партнёрам')).toHaveAttribute('open', '');
    await expect(panelFor(page, 'Пассажирам')).not.toHaveAttribute('open', '');
  });

  test('its links lead where they say', async ({ page }) => {
    await page.goto('/ru');
    await page.getByText('Пассажирам', { exact: true }).first().click();
    await page.getByRole('banner').getByRole('link', { name: 'Розыск багажа' }).click();

    // Asserted on the destination, not the prefix: next-intl serves the default
    // language both with and without one.
    await expect(page).toHaveURL(/\/passengers\/baggage-tracing$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('every panel also opens onto its own section index', async ({ page }) => {
    // The menu predates a fifth of the content tree; without this those pages
    // would be reachable only by someone who already knew they existed.
    await page.goto('/ru');

    // The locale prefix is added by next-intl's routing rather than written
    // into the rendered href, so the assertion is about the destination.
    for (const [label, href] of [
      ['Пассажирам', '/passengers'],
      ['Партнёрам', '/partners'],
      ['Пресс-центр', '/press'],
    ] as const) {
      await page.getByText(label, { exact: true }).first().click();
      const link = panelFor(page, label).getByRole('link', { name: 'Все страницы раздела' });
      await expect(link).toHaveAttribute('href', href);
    }
  });

  test('works with no JavaScript at all', async ({ browser }) => {
    // The property the whole `<details>` design exists for.
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto('/ru');
    await page.getByText('Партнёрам', { exact: true }).first().click();

    // Scoped to the header: the home page also mentions the seasonal schedule
    // in the card describing the flights section.
    const link = page.getByRole('banner').getByRole('link', { name: 'Сезонное расписание' });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/flights\/statistics$/);

    await context.close();
  });

  test('opens from the keyboard and says whether it is open', async ({ page }) => {
    await page.goto('/ru');

    const summary = page.locator('header summary').first();
    await summary.focus();
    await page.keyboard.press('Enter');

    await expect(panelFor(page, 'Пассажирам')).toHaveAttribute('open', '');
    // `<details>` carries this itself, which is the reason for using it.
    expect(await summary.evaluate((node) => node.getAttribute('aria-expanded'))).not.toBe('false');
  });

  test('fits a phone without pushing the page sideways', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/ru');
    await page.getByText('Пассажирам', { exact: true }).first().click();

    const overflow = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="menu-panel"]')!;
      return panel.getBoundingClientRect().right - window.innerWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('an open panel is accessible', async ({ page }) => {
    await page.goto('/ru');
    await page.getByText('Пассажирам', { exact: true }).first().click();

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const blocking = results.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious'
    );

    expect(blocking.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
