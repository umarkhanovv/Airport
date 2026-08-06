import { expect, test, type Page } from '@playwright/test';

/**
 * PWA — Stage 9 (spec §17.4, plan decision #7).
 *
 * The exit criteria: installable, and the board renders offline with a correct
 * as-of date. Both are asserted against the real standalone build, because the
 * service worker does not exist in a dev build at all.
 */

const BOARD = '/flights?view=week&kind=departures';

/** Waits for the worker to install and take control of the page. */
async function activateServiceWorker(page: Page) {
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, undefined, {
    timeout: 20_000,
  });
}

test.describe('installability', () => {
  test('serves a manifest with the fields a browser needs to offer install', async ({ page }) => {
    const response = await page.request.get('/manifest.webmanifest');
    expect(response.status()).toBe(200);

    const manifest = await response.json();
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');

    // Android needs a 192 and a 512, and a maskable icon or it composites the
    // square onto a white circle and the mark ends up tiny.
    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === 'maskable')).toBe(
      true
    );
  });

  test('every icon the manifest promises actually exists', async ({ page }) => {
    const manifest = await (await page.request.get('/manifest.webmanifest')).json();

    for (const icon of manifest.icons as Array<{ src: string }>) {
      const response = await page.request.get(icon.src);
      expect(response.status(), icon.src).toBe(200);
      expect(response.headers()['content-type'], icon.src).toContain('image/png');
    }
  });

  test('links the manifest and an apple-touch-icon from the page', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
    // iOS ignores the manifest when adding to the home screen and reads this.
    const apple = page.locator('link[rel="apple-touch-icon"]');
    await expect(apple).toHaveCount(1);

    const response = await page.request.get((await apple.getAttribute('href'))!);
    expect(response.status()).toBe(200);
  });
});

test.describe('offline', () => {
  // Serial: these share one browser context's service worker registration.
  test.describe.configure({ mode: 'serial' });

  test('the board still renders offline, with its as-of date', async ({ page, context }) => {
    await page.goto(BOARD);
    await activateServiceWorker(page);

    // Load once more so the board itself is in the runtime cache.
    await page.reload();
    await expect(page.locator('[data-flight-row]').first()).toBeVisible();
    const asOf = await page.getByText(/Расписание загружено/).textContent();
    expect(asOf).toBeTruthy();

    await context.setOffline(true);
    try {
      await page.reload();

      // The whole point of spec §17.4: flight times, offline.
      await expect(page.locator('[data-flight-row]').first()).toBeVisible();
      // And the date the schedule was loaded, so nobody mistakes a cached
      // board for a live one.
      await expect(page.getByText(/Расписание загружено/)).toHaveText(asOf!);
    } finally {
      await context.setOffline(false);
    }
  });

  test('a page never visited falls back to the offline notice, not a browser error', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await activateServiceWorker(page);

    await context.setOffline(true);
    try {
      await page.goto('/partners/advertising');
      // Trilingual by design: offline there is no server to decide a language.
      await expect(
        page.getByRole('heading', { name: 'Нет подключения к интернету' })
      ).toBeVisible();
      await expect(page.getByRole('heading', { name: 'You are offline' })).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });

  test('the admin panel is never cached', async ({ page, context }) => {
    // Caching an admin page leaves the airport's schedule management in the
    // browser of whoever uses that machine next (plan §9.1).
    await page.goto('/admin/login');
    await page.goto('/');
    await activateServiceWorker(page);

    const cachedAdminUrls = await page.evaluate(async () => {
      const names = await caches.keys();
      const found: string[] = [];
      for (const name of names) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          if (new URL(request.url).pathname.startsWith('/admin')) found.push(request.url);
        }
      }
      return found;
    });

    expect(cachedAdminUrls).toEqual([]);

    await context.setOffline(true);
    try {
      await page.goto('/admin/login');
      await expect(page.getByRole('heading', { name: 'Airport admin' })).toHaveCount(0);
    } finally {
      await context.setOffline(false);
    }
  });
});
