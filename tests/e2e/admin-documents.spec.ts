import { expect, test, type Page } from '@playwright/test';

import { ADMIN_STORAGE_STATE } from './admin-session';

/**
 * The document library (spec §5).
 *
 * These files were going to be committed to the repository as part of the
 * content migration. The client stopped that, correctly: procurement notices
 * are added and superseded weekly, and material that changes weekly does not
 * belong in a deploy. So they are uploaded here and appear under whichever
 * content page they are filed against.
 *
 * The property worth testing is the pair either side of publication: an
 * unpublished document must not be downloadable by anyone who has its URL, and
 * a published one must arrive as a download with its own name rather than as
 * something the browser renders inside this site.
 */

/** A real, minimal PDF — valid enough to be recognised, small enough to inline. */
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
  'latin1'
);

/**
 * A page of its own per test, and that is not tidiness.
 *
 * These tests run in parallel, and every upload, rename, unpublish and delete
 * regenerates the page its document is filed against. Pointed at one page they
 * were six editors working on the same document list at once — which loses
 * about a quarter of its edits, because a regeneration in flight can finish
 * after a later edit invalidated the page and write its older render back as
 * current. That is a real defect and it is bounded in
 * `app/[locale]/[...slug]/page.tsx`, but bounded means five minutes, so a test
 * that raced would still be waiting long after it had timed out.
 *
 * Each one owns its page instead. Nothing here is about how pages interact, so
 * there is nothing to lose by separating them, and it takes the suite's own
 * contention out of a test whose subject is a single document.
 */
const PAGES = {
  publish: 'flights/cargo',
  unpublish: 'passengers/check-in',
  rename: 'about/bank-details',
  delete: 'passengers/security',
  refuse: 'airport/parking',
  batch: 'airport/taxi',
} as const;

function unique(label: string): string {
  return `E2E ${label} ${Math.random().toString(36).slice(2, 10)}`;
}

function rowFor(page: Page, title: string) {
  return page.locator('[data-testid="document-row"]', { hasText: title });
}

async function upload(page: Page, pagePath: string, filename: string) {
  await page.goto('/admin/documents');
  await page.locator('#pagePath').selectOption(pagePath);
  await page.locator('#publishedAt').fill('2026-03-01');
  await page
    .locator('#files')
    .setInputFiles({ name: filename, mimeType: 'application/pdf', buffer: PDF });
  await page.getByRole('button', { name: 'Upload' }).click();
  await expect(page.getByRole('main').getByRole('status')).toContainText('uploaded');
}

test.describe('the library is staff-only', () => {
  test('redirects to login when signed out', async ({ page }) => {
    await page.goto('/admin/documents');
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});

test.describe('publishing a document', () => {
  test.use({
    storageState: ADMIN_STORAGE_STATE,
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.41' },
  });

  test('appears on the page it was filed against, and downloads with its own name', async ({
    page,
  }) => {
    const title = unique('tariff');
    await upload(page, PAGES.publish, `${title}.pdf`);

    // The title defaults to the filename, and is corrected in place.
    const row = rowFor(page, title);
    await expect(row).toHaveCount(1);

    const href = await row.getByRole('link', { name: 'Download' }).getAttribute('href');
    const response = await page.request.get(href!);

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('application/pdf');
    // An attachment, sandboxed, with sniffing off — never rendered in this
    // site's origin, whatever the file turns out to be.
    expect(response.headers()['content-disposition']).toContain('attachment');
    expect(response.headers()['content-disposition']).toContain(title);
    expect(response.headers()['x-content-type-options']).toBe('nosniff');

    // And it is on the public page, in every language.
    //
    // Re-fetched until it is there rather than asserted once: the page is
    // statically generated and the action revalidates it, so this is eventual
    // by design — and the whole suite is revalidating the same tree at once,
    // which a single fetch loses to.
    for (const locale of ['ru', 'en', 'kz']) {
      await expect(async () => {
        await page.goto(`/${locale}/${PAGES.publish}`);
        await expect(page.getByRole('link', { name: new RegExp(title) })).toBeVisible();
      }).toPass();
    }
  });

  test('unpublishing takes it off the page and stops serving the file', async ({ page }) => {
    const title = unique('withdrawn');
    await upload(page, PAGES.unpublish, `${title}.pdf`);

    const href = await rowFor(page, title)
      .getByRole('link', { name: 'Download' })
      .getAttribute('href');

    await rowFor(page, title).getByRole('button', { name: 'Unpublish' }).click();
    await expect(rowFor(page, title)).toHaveAttribute('data-published', 'false');

    // Not merely hidden from the page: the URL stops working, so a link that
    // was shared while it was public does not keep working after it is pulled.
    expect((await page.request.get(href!)).status()).toBe(404);

    await expect(async () => {
      await page.goto(`/ru/${PAGES.unpublish}`);
      await expect(page.locator('main')).not.toContainText(title);
    }).toPass();
  });

  test('renaming changes the link text, not the file', async ({ page }) => {
    const title = unique('rename');
    await upload(page, PAGES.rename, `${title}.pdf`);

    const corrected = `Приказ КД от 01.03.2026 года ${title}`;
    await rowFor(page, title).locator('input[name="title"]').fill(corrected);
    await rowFor(page, title).getByRole('button', { name: 'Rename' }).click();
    await expect(page).toHaveURL(/saved=1/);

    await expect(async () => {
      await page.goto(`/ru/${PAGES.rename}`);
      await expect(page.getByRole('link', { name: new RegExp(corrected) })).toBeVisible();
    }).toPass();
  });

  test('deleting removes it from the page and from disk', async ({ page }) => {
    const title = unique('delete');
    await upload(page, PAGES.delete, `${title}.pdf`);

    const href = await rowFor(page, title)
      .getByRole('link', { name: 'Download' })
      .getAttribute('href');

    await rowFor(page, title).getByRole('button', { name: 'Delete' }).click();
    await expect(page).toHaveURL(/deleted=1/);
    await expect(rowFor(page, title)).toHaveCount(0);

    expect((await page.request.get(href!)).status()).toBe(404);
  });
});

test.describe('what may be uploaded', () => {
  test.use({
    storageState: ADMIN_STORAGE_STATE,
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.42' },
  });

  test('refuses a format a browser would execute', async ({ page }) => {
    await page.goto('/admin/documents');
    await page.locator('#pagePath').selectOption(PAGES.refuse);
    await page.locator('#files').setInputFiles({
      name: 'notice.html',
      mimeType: 'text/html',
      buffer: Buffer.from('<script>alert(1)</script>'),
    });
    await page.getByRole('button', { name: 'Upload' }).click();

    await expect(page.getByRole('main').getByRole('alert')).toContainText('not a document');
  });

  test('a bad file in a batch does not lose the good ones', async ({ page }) => {
    // Staff select thirty files at a time. Being told which two were wrong is
    // the difference between a usable form and one that is worked around.
    const good = unique('batch');

    await page.goto('/admin/documents');
    await page.locator('#pagePath').selectOption(PAGES.batch);
    await page.locator('#files').setInputFiles([
      { name: `${good}.pdf`, mimeType: 'application/pdf', buffer: PDF },
      { name: 'notice.html', mimeType: 'text/html', buffer: Buffer.from('<p>no</p>') },
    ]);
    await page.getByRole('button', { name: 'Upload' }).click();

    await expect(page.getByRole('main').getByRole('status')).toContainText('1 file uploaded');
    await expect(page.getByRole('main').getByRole('alert')).toContainText('notice.html');
    await expect(rowFor(page, good)).toHaveCount(1);
  });
});

test.describe('staleness', () => {
  test('a page carrying documents has a lifetime, so an edit cannot stick forever', async ({
    page,
  }) => {
    /*
     * The pages these documents appear on are prerendered, and were prerendered
     * with no lifetime at all — `initialRevalidateSeconds: false`. That was
     * fine as long as every edit's `revalidatePath` landed, and mostly it does:
     * 34 ms on an idle server, 357 ms on a saturated one. But two edits to one
     * page can overlap, and then a regeneration already in flight writes its
     * older render back as current. With no lifetime that page never recovered
     * — it served `x-nextjs-cache: HIT` with the wrong title until somebody
     * edited that page again, which might be never.
     *
     * So `app/[locale]/[...slug]/page.tsx` gives it one. This asserts the
     * consequence rather than the export, because the consequence is what a
     * caching proxy in front of the airport's server reads too — and the same
     * header is what stopped it holding a withdrawn notice for a year.
     */
    const response = await page.request.get(`/ru/${PAGES.publish}`);
    const maxAge = /s-maxage=(\d+)/.exec(response.headers()['cache-control'] ?? '');

    expect(maxAge, `no s-maxage in "${response.headers()['cache-control']}"`).not.toBeNull();
    expect(
      Number(maxAge![1]),
      'a document edit should not be able to stick for long'
    ).toBeLessThanOrEqual(600);
  });
});

test.describe('serving', () => {
  test('refuses a path that is not a name this application generated', async ({ page }) => {
    for (const name of ['../../app.db', 'passwd', '00000000-0000-0000-0000-000000000000.html']) {
      const response = await page.request.get(`/api/documents/${encodeURIComponent(name)}`);
      expect(response.status(), name).toBe(404);
    }
  });
});
