import { expect, test, type Page } from '@playwright/test';

import { ADMIN_STORAGE_STATE } from './admin-session';

/**
 * Writing news from the admin panel (spec §7, §8).
 *
 * Outstanding from Stage 6 until now: staff could upload a schedule and read
 * feedback, but adding an announcement meant running a script on the server.
 *
 * The property these tests exist for is the one the public site depends on —
 * that a draft is not published. Everything else here is a form; that one is a
 * promise to the airport that it can prepare an announcement before it is true.
 */

/** Latin so the generated slug is predictable, unique so workers cannot collide. */
function uniqueTitle(label: string): { title: string; slug: string } {
  const suffix = Math.random().toString(36).slice(2, 10);
  const title = `E2E ${label} ${suffix}`;
  return { title, slug: `e2e-${label.toLowerCase().replace(/\s+/g, '-')}-${suffix}` };
}

/** A real 1x1 PNG. Small enough to inline, valid enough to pass the sniffer. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

async function fillPost(
  page: Page,
  {
    title,
    body = 'Body text long enough to pass validation.',
    publish = false,
    locale = 'en',
    // Old by default, so a published test post never displaces the fixture at
    // the top of the public list and never changes what "newest first" means
    // there. Overridden only where a test needs the post to be among the
    // newest — the home page shows three, and nothing else can put it there.
    publishedAt = '2019-01-15',
  } = {} as {
    title: string;
    body?: string;
    publish?: boolean;
    locale?: string;
    publishedAt?: string;
  }
) {
  if (await page.locator('select#locale').count()) {
    await page.locator('select#locale').selectOption(locale);
  }
  await page.locator('#title').fill(title);
  await page.locator('#body').fill(body);
  await page.locator('#publishedAt').fill(publishedAt);
  if (publish) await page.locator('input[name="isPublished"]').check();
}

async function createPost(page: Page, options: Parameters<typeof fillPost>[1]) {
  await page.goto('/admin/news/new');
  await fillPost(page, options);
  await page.getByRole('button', { name: 'Create post' }).click();
  await expect(page).toHaveURL(/\/admin\/news\?saved=1/);
}

function rowFor(page: Page, title: string) {
  return page.locator('[data-testid="news-row"]', { hasText: title });
}

test.describe('the news panel is staff-only', () => {
  test('every screen redirects to login when signed out', async ({ page }) => {
    for (const path of ['/admin/news', '/admin/news/new']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/admin\/login/);
    }
  });
});

test.describe('writing a post', () => {
  test.use({
    storageState: ADMIN_STORAGE_STATE,
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.31' },
  });

  test('a new post is a draft, and a draft is not on the public site', async ({ page }) => {
    const { title, slug } = uniqueTitle('draft');
    await createPost(page, { title });

    await expect(rowFor(page, title)).toHaveAttribute('data-published', 'false');

    // The public site must not serve it, by list or by guessed URL.
    await page.goto('/en/news');
    await expect(page.locator('main')).not.toContainText(title);
    expect((await page.goto(`/en/news/${slug}`))?.status()).toBe(404);
  });

  test('publishing puts it on the public site, and unpublishing takes it off', async ({ page }) => {
    const { title, slug } = uniqueTitle('publish');
    await createPost(page, { title, publish: true });

    await expect(rowFor(page, title)).toHaveAttribute('data-published', 'true');

    await page.goto(`/en/news/${slug}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);

    // Taking an announcement down has to take it down — this is the case that
    // the revalidation in the action exists for.
    await page.goto('/admin/news');
    await rowFor(page, title).getByRole('button', { name: 'Unpublish' }).click();
    await expect(rowFor(page, title)).toHaveAttribute('data-published', 'false');

    expect((await page.goto(`/en/news/${slug}`))?.status()).toBe(404);
  });

  test('reports every validation problem at once and keeps what was typed', async ({ page }) => {
    await page.goto('/admin/news/new');
    await page.locator('#title').fill('ab');
    await page.locator('#body').fill('short');
    await page.getByRole('button', { name: 'Create post' }).click();

    await expect(page.locator('#title-error')).toBeVisible();
    await expect(page.locator('#body-error')).toBeVisible();
    // Nothing was created.
    await expect(page).toHaveURL(/\/admin\/news\/new/);
  });

  test('renders a scripted headline as text, not as script', async ({ page }) => {
    // Posts migrated from a WordPress site bring its markup habits with them,
    // and the admin list is where staff meet them.
    const payload = `<img src=x onerror="window.__xss=true">`;
    const { title } = uniqueTitle('xss');
    await createPost(page, { title: `${title} ${payload}` });

    const row = rowFor(page, title);
    await expect(row).toContainText('<img');
    await expect(row.locator('img')).toHaveCount(0);
    expect(
      await page.evaluate(() => (window as unknown as { __xss?: boolean }).__xss)
    ).toBeUndefined();
  });
});

test.describe('editing a post', () => {
  test.use({
    storageState: ADMIN_STORAGE_STATE,
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.32' },
  });

  test('the headline can change but the address cannot', async ({ page }) => {
    const { title, slug } = uniqueTitle('edit');
    await createPost(page, { title, publish: true });

    await rowFor(page, title).getByRole('link', { name: title }).click();
    const corrected = `${title} corrected`;
    await page.locator('#title').fill(corrected);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page).toHaveURL(/\/admin\/news\?saved=1/);

    // A URL that has been shared, indexed or printed is a promise: the post is
    // still where it was, under its original slug, with the new headline.
    await page.goto(`/en/news/${slug}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(corrected);
  });
});

test.describe('cover images', () => {
  test.use({
    storageState: ADMIN_STORAGE_STATE,
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.33' },
  });

  test('refuses a file that is not an image, whatever it is called', async ({ page }) => {
    const { title } = uniqueTitle('badimage');

    await page.goto('/admin/news/new');
    await fillPost(page, { title });
    await page.locator('#cover').setInputFiles({
      name: 'photo.png',
      mimeType: 'image/png',
      buffer: Buffer.from('<html><script>alert(1)</script></html>'),
    });
    await page.locator('#coverAlt').fill('A photograph of the terminal');
    await page.getByRole('button', { name: 'Create post' }).click();

    await expect(page.locator('#cover-error')).toBeVisible();
  });

  test('insists on a description for an image that is one', async ({ page }) => {
    const { title } = uniqueTitle('needsalt');

    await page.goto('/admin/news/new');
    await fillPost(page, { title });
    await page
      .locator('#cover')
      .setInputFiles({ name: 'apron.png', mimeType: 'image/png', buffer: PNG });
    await page.getByRole('button', { name: 'Create post' }).click();

    await expect(page.locator('#coverAlt-error')).toBeVisible();
  });

  test('stores an image and serves it back', async ({ page }) => {
    const { title } = uniqueTitle('withimage');

    await page.goto('/admin/news/new');
    await fillPost(page, { title });
    await page
      .locator('#cover')
      .setInputFiles({ name: 'apron.png', mimeType: 'image/png', buffer: PNG });
    await page.locator('#coverAlt').fill('An aircraft on the apron at dusk');
    await page.getByRole('button', { name: 'Create post' }).click();
    await expect(page).toHaveURL(/\/admin\/news\?saved=1/);

    await rowFor(page, title).getByRole('link', { name: title }).click();

    const image = page.locator('img[src^="/api/news/image/"]');
    await expect(image).toHaveAttribute('alt', 'An aircraft on the apron at dusk');

    // Served from DATA_DIR through the handler, with the type decided there.
    const source = await image.getAttribute('src');
    const response = await page.request.get(source!);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('image/png');
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
  });

  /*
   * The test above passed for months while covers were invisible to the
   * public, because it asserted the image on the admin edit screen — the one
   * page that always rendered it. Uploading worked, storing worked, serving
   * worked, and no public page had an `<img>` at all.
   *
   * So this one never looks at the panel. It publishes a post with a cover and
   * then goes to the three places a reader could meet it.
   */
  test('shows the cover to readers, on the post, the list and the home page', async ({ page }) => {
    const { title, slug } = uniqueTitle('publiccover');
    const alt = 'An aircraft on the apron at dusk';

    await page.goto('/admin/news/new');
    // Recent, because the home page shows the three newest and nothing else.
    await fillPost(page, { title, publish: true, publishedAt: '2030-01-15' });
    await page
      .locator('#cover')
      .setInputFiles({ name: 'apron.png', mimeType: 'image/png', buffer: PNG });
    await page.locator('#coverAlt').fill(alt);
    await page.getByRole('button', { name: 'Create post' }).click();
    await expect(page).toHaveURL(/\/admin\/news\?saved=1/);

    for (const path of [`/en/news/${slug}`, '/en/news', '/en']) {
      await page.goto(path);

      const image = page.locator(`main img[src^="/api/news/image/"][alt="${alt}"]`);
      await expect(image, `no cover on ${path}`).toHaveCount(1);

      // Reserved before it loads: a list that reflows as its images arrive is
      // the failure this site is built to avoid.
      await expect(image).toHaveAttribute('width', /\d+/);
      await expect(image).toHaveAttribute('height', /\d+/);

      const source = await image.getAttribute('src');
      expect((await page.request.get(source!)).status(), `broken cover on ${path}`).toBe(200);
    }
  });
});

test.describe('deleting a post', () => {
  test.use({
    storageState: ADMIN_STORAGE_STATE,
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.34' },
  });

  test('refuses unless the headline is typed back, then removes it', async ({ page }) => {
    const { title, slug } = uniqueTitle('delete');
    await createPost(page, { title, publish: true });

    await rowFor(page, title).getByRole('link', { name: title }).click();
    // Captured only once the navigation has landed: `page.url()` straight after
    // a click can still be the page being left.
    await page.waitForURL(/\/admin\/news\/[0-9a-f-]{36}$/);
    const editUrl = page.url();

    // Wrong headline: nothing happens, and it says so.
    await page.locator('#confirmTitle').fill('something else');
    await page.getByRole('button', { name: 'Delete permanently' }).click();
    await expect(page.locator('#confirm-error')).toBeVisible();

    await page.goto('/admin/news');
    await expect(rowFor(page, title)).toHaveCount(1);

    // Right headline: gone from the panel and from the public site.
    await page.goto(editUrl);
    await page.locator('#confirmTitle').fill(title);
    await page.getByRole('button', { name: 'Delete permanently' }).click();
    await expect(page).toHaveURL(/\/admin\/news\?deleted=1/);
    await expect(rowFor(page, title)).toHaveCount(0);

    expect((await page.goto(`/en/news/${slug}`))?.status()).toBe(404);
  });
});
