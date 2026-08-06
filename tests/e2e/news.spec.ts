import { expect, test } from '@playwright/test';

/**
 * News (spec §7).
 *
 * Two properties matter most. Drafts must never reach the public site — the
 * airport prepares announcements before they are true. And the translation
 * story must be honest: of 27 legacy posts only two exist in all three
 * languages (plan §1.5), so the UI has to say which languages a story is
 * actually in rather than implying more.
 */

test.describe('news list', () => {
  test('lists published posts, newest first', async ({ page }) => {
    await page.goto('/news');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Новости');
    const items = page.locator('main article');
    expect(await items.count()).toBeGreaterThan(1);

    const dates = await page
      .locator('main time')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('datetime') ?? ''));
    expect(dates).toEqual([...dates].sort().reverse());
  });

  test('never shows an unpublished draft', async ({ page }) => {
    // The fixture contains one, titled so it is unmistakable if it leaks.
    for (const path of ['/news', '/news?page=2']) {
      await page.goto(path);
      await expect(page.locator('main')).not.toContainText('ЧЕРНОВИК');
    }

    // Nor by guessing its URL.
    const response = await page.goto('/news/chernovik-ne-dlya-publikatsii');
    expect(response?.status()).toBe(404);
  });

  test('paginates with plain links that work without JavaScript', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto('/news');
    await page.getByRole('link', { name: /Вперёд/ }).click();

    await expect(page).toHaveURL(/page=2/);
    expect(await page.locator('main article').count()).toBeGreaterThan(0);

    await page.getByRole('link', { name: /Назад/ }).click();
    await expect(page).toHaveURL(/\/news$/);
    await context.close();
  });
});

test.describe('news detail', () => {
  test('renders a post', async ({ page }) => {
    await page.goto('/news/novyi-reis-turkestan-samarkand');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Самарканд');
    await expect(page.locator('main')).toContainText('дважды в неделю');
    await expect(page.locator('time')).toHaveAttribute('datetime', '2025-05-01');
  });

  test('offers the same story in its other languages', async ({ page }) => {
    await page.goto('/news/novyi-reis-turkestan-samarkand');

    // Scoped to the notice: the header language switcher also says "English".
    const notice = page.locator('[data-translations]');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('Эта новость также доступна на:');

    // Following the English link lands on the English version, under /en.
    await notice.getByRole('link', { name: 'English' }).click();
    await expect(page).toHaveURL(/\/en\/news\/new-route-turkistan-samarkand/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Samarkand');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('says nothing about translations when a story has none', async ({ page }) => {
    // The common case. Implying a translation exists would send the reader
    // looking for something that is not there.
    await page.goto('/news/aeroport-poluchil-sertifikat');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('[data-translations]')).toHaveCount(0);
  });

  test('404s an unknown slug', async ({ page }) => {
    const response = await page.goto('/news/no-such-post');
    expect(response?.status()).toBe(404);
  });

  test('a Kazakh post renders with the correct language attribute', async ({ page }) => {
    await page.goto('/kz/news/turkistan-samarqand-zhanga-reisi');
    await expect(page.locator('html')).toHaveAttribute('lang', 'kk');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Самарқанд');
  });
});

test.describe('slugs', () => {
  test('are readable Latin, not percent-encoded Cyrillic', async ({ page }) => {
    await page.goto('/news');

    const hrefs = await page
      .locator('main article a')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('href') ?? ''));

    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      // The legacy site served /%d1%82%d2%af%d1%80... for every Cyrillic title.
      expect(href, `${href} should not be percent-encoded`).not.toMatch(/%[0-9a-f]{2}/i);
      expect(href).toMatch(/^\/news\/[a-z0-9-]+$/);
    }
  });
});

test.describe('news images', () => {
  test('refuses to serve anything outside the uploads directory', async ({ page }) => {
    for (const attempt of [
      '/api/news/image/..%2F..%2Fapp.db',
      '/api/news/image/....//app.db',
      '/api/news/image/%2e%2e%2fapp.db',
      '/api/news/image/app.db',
      '/api/news/image/nonexistent.png',
    ]) {
      // Redirects are followed on purpose: Next normalises a double slash to a
      // 308, and what matters is where the attempt *ends up*, not that the
      // first hop is an error.
      const response = await page.request.get(attempt);
      expect(response.status(), `${attempt} must not resolve to a file`).toBe(404);

      // The decisive check — no attempt may ever come back as file bytes.
      const type = response.headers()['content-type'] ?? '';
      expect(type, `${attempt} returned ${type}`).not.toMatch(/image|octet-stream|sqlite/);
      expect(await response.body()).not.toContain(Buffer.from('SQLite format'));
    }
  });
});
