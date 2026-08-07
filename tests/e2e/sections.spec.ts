import { expect, test } from '@playwright/test';

/**
 * Section indexes (spec §5).
 *
 * The migrated pages were unreachable for a while: `content/` held 52 pages per
 * language and every section index rendered a placeholder, so the only route to
 * any of them was typing the address. These tests exist so that cannot happen
 * again quietly — a page nobody can navigate to is, to a visitor, a page that
 * does not exist.
 */

const SECTIONS = ['flights', 'airport', 'passengers', 'about', 'partners'] as const;

test.describe('section indexes', () => {
  test('every section lists the pages it holds', async ({ page }) => {
    for (const section of SECTIONS) {
      await page.goto(`/ru/${section}`);

      const links = page.getByRole('navigation', { name: /Страницы раздела/ }).getByRole('link');
      expect(await links.count(), `/ru/${section} should list its pages`).toBeGreaterThan(0);
    }
  });

  test('the links go somewhere, in every language', async ({ page }) => {
    for (const path of ['/ru/passengers', '/en/passengers', '/kz/passengers']) {
      await page.goto(path);

      const first = page
        .getByRole('navigation', { name: /Страницы раздела|Pages in this section|Бөлім беттері/ })
        .getByRole('link')
        .first();

      await first.click();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(page.url()).not.toContain('/404');
    }
  });

  test('works with no JavaScript — these are plain links', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto('/ru/passengers');
    await page.getByRole('link', { name: 'Упаковка багажа' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Упаковка багажа');

    await context.close();
  });

  test('a page still awaiting its text is listed, marked, and says so', async ({ page }) => {
    // Listing it is the point: someone looking for the police desk is better
    // served by "that page is here and its text is coming" than by a section
    // that appears not to cover it.
    await page.goto('/ru/passengers');

    const link = page.getByRole('link', { name: /Полиция/ });
    await expect(link).toContainText('готовится');

    await link.click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Полиция');
    await expect(page.locator('main')).toContainText('готовится');
  });

  test('the pages listed are the ones that belong to the section', async ({ page }) => {
    await page.goto('/ru/passengers');

    const hrefs = await page
      .getByRole('navigation', { name: /Страницы раздела/ })
      .getByRole('link')
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLAnchorElement).pathname));

    // The locale prefix is added by next-intl's routing rather than written
    // into the rendered href, so the assertion is about the section, not it.
    expect(
      hrefs.every((href) => href.includes('/passengers/')),
      hrefs.join(' ')
    ).toBe(true);
  });
});
