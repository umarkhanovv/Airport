import { expect, test } from '@playwright/test';

/**
 * Stage 0 exit criteria: all three locales route and render, with the URL
 * scheme inherited from the legacy site (plan §1.3, decision #4).
 */

/**
 * `nav` is the header's board link, which is the shortest string on the page
 * that is definitely translated. It used to be the section label "Рейсы", read
 * off the home page's grid of section cards; that grid is gone — it repeated
 * the header on every visit — so the assertion reads the header itself.
 */
const LOCALES = [
  { id: 'ru', path: '/', lang: 'ru', nav: 'Табло' },
  { id: 'en', path: '/en', lang: 'en', nav: 'Board' },
  { id: 'kk', path: '/kz', lang: 'kk', nav: 'Тақта' },
] as const;

for (const locale of LOCALES) {
  test.describe(`locale ${locale.id}`, () => {
    test(`renders at ${locale.path} with lang="${locale.lang}"`, async ({ page }) => {
      const response = await page.goto(locale.path);
      expect(response?.status()).toBe(200);

      // The Kazakh URL prefix is /kz, but the language attribute must be `kk`
      // — `kz` is a country code, not a language code.
      await expect(page.locator('html')).toHaveAttribute('lang', locale.lang);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByRole('navigation', { name: /.+/ }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: locale.nav }).first()).toBeVisible();
    });

    test('all seven IA sections resolve', async ({ page }) => {
      const sections = [
        'flights',
        'airport',
        'passengers',
        'about',
        'partners',
        'press',
        'contacts',
      ];
      const prefix = locale.path === '/' ? '' : locale.path;

      for (const section of sections) {
        const response = await page.goto(`${prefix}/${section}`);
        expect(response?.status(), `${prefix}/${section} should resolve`).toBe(200);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      }
    });
  });
}

test('unknown sections 404 rather than rendering an empty page', async ({ page }) => {
  const response = await page.goto('/not-a-real-section');
  expect(response?.status()).toBe(404);
});

test('the default locale is not prefixed', async ({ page }) => {
  // Russian lives at the root, so `/ru` is superfluous. next-intl redirects it
  // to `/` rather than 404ing — which is the better behaviour: any link that
  // does include the prefix still lands on a real page and keeps its equity.
  await page.goto('/ru');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
});

test('the internal Kazakh locale id is not a public URL', async ({ page }) => {
  // The identifier is `kk` (BCP-47) but the public prefix is `/kz`. `/kk` must
  // not be reachable, or we would publish two URLs for the same content.
  const response = await page.goto('/kk');
  expect(response?.status()).toBe(404);
});

test('skip link is the first focusable element', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const focused = page.locator(':focus');
  await expect(focused).toHaveAttribute('href', '#main');
});
