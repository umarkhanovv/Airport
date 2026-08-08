import zlib from 'node:zlib';

import { expect, test, type Page } from '@playwright/test';

import { ADMIN_STORAGE_STATE } from './admin-session';

/**
 * Stage 10 — the security and performance budgets, enforced.
 *
 * Both are stated as prose in the plan (§9.1, §9.2), which is how they erode:
 * a header gets dropped in a config refactor, a dependency adds 30 KB, and
 * nobody notices until it is somebody else's problem. These run against the
 * real standalone bundle, which is what the airport will serve.
 *
 * The secrets checked for are the throwaway values `playwright.config.ts` sets.
 * That is the point: they are real values held by the real server for the
 * duration of this run, so finding them absent from everything the browser is
 * given is evidence rather than an assertion about the code.
 */

const ADMIN_PASSWORD = 'e2e-admin-password';
const SESSION_SECRET = 'e2e-session-secret-not-for-production';

/** Every script the page loads, plus the document itself. */
async function clientPayload(page: Page): Promise<Array<{ url: string; body: string }>> {
  const html = await page.content();
  const sources = await page
    .locator('script[src]')
    .evaluateAll((nodes) => nodes.map((node) => (node as HTMLScriptElement).src));

  const scripts = await Promise.all(
    [...new Set(sources)].map(async (url) => ({
      url,
      body: await (await page.request.get(url)).text(),
    }))
  );

  return [{ url: page.url(), body: html }, ...scripts];
}

test.describe('security headers', () => {
  test('are set on every response, public and admin alike', async ({ page }) => {
    for (const path of ['/ru', '/ru/flights', '/admin/login']) {
      const response = await page.goto(path);
      const headers = response!.headers();

      expect(headers['x-content-type-options'], path).toBe('nosniff');
      expect(headers['referrer-policy'], path).toBe('strict-origin-when-cross-origin');
      expect(headers['permissions-policy'], path).toContain('geolocation=()');

      const csp = headers['content-security-policy'] ?? '';
      expect(csp, path).toContain("object-src 'none'");
      expect(csp, path).toContain("base-uri 'self'");
      expect(csp, path).toContain("form-action 'self'");
      // Clickjacking: the admin panel is the one worth framing.
      expect(csp, path).toContain("frame-ancestors 'none'");
    }
  });

  test('does not advertise the framework', async ({ page }) => {
    const response = await page.goto('/ru');
    expect(response!.headers()['x-powered-by']).toBeUndefined();
  });
});

test.describe('secrets', () => {
  test('reach no part of what the browser is served', async ({ page }) => {
    await page.goto('/ru/flights');

    for (const { url, body } of await clientPayload(page)) {
      expect(body, `${url} contains the admin password`).not.toContain(ADMIN_PASSWORD);
      expect(body, `${url} contains the session secret`).not.toContain(SESSION_SECRET);
    }
  });

  test('reach no part of the admin panel either', async ({ browser }) => {
    // The panel is where a secret would most plausibly be leaked into a prop.
    const context = await browser.newContext({ storageState: ADMIN_STORAGE_STATE });
    const page = await context.newPage();
    await page.goto('/admin');

    for (const { url, body } of await clientPayload(page)) {
      expect(body, `${url} contains the admin password`).not.toContain(ADMIN_PASSWORD);
      expect(body, `${url} contains the session secret`).not.toContain(SESSION_SECRET);
    }

    await context.close();
  });

  test('the session cookie carries no readable claim about the password', async ({ browser }) => {
    const context = await browser.newContext({ storageState: ADMIN_STORAGE_STATE });
    const cookies = await context.cookies();
    const session = cookies.find((cookie) => cookie.name === 'hsa_admin');

    expect(session, 'the admin session cookie should exist').toBeDefined();
    expect(session!.httpOnly).toBe(true);
    expect(session!.sameSite).toBe('Lax');
    expect(session!.value).not.toContain(ADMIN_PASSWORD);
    expect(session!.value).not.toContain(SESSION_SECRET);

    await context.close();
  });
});

/**
 * Page weight — measured, not capped.
 *
 * This was a budget: ceilings on HTML, stylesheet and hydration JavaScript,
 * failing the build when a page grew past them. The airport has removed the
 * ceilings, so nothing here fails for being large.
 *
 * The measurement stays, and stays for a reason: the ceilings are gone but the
 * connection this site is read on is not, and a number nobody records is a
 * number nobody notices going up. These print into the run so a change in page
 * weight is visible in the same place the change was made, rather than being
 * discovered by a passenger on a slow phone.
 *
 * Gzipped here rather than trusting the server's `content-length`, so the
 * figures do not move when a reverse proxy's compression settings change.
 */

const gzipped = (body: string) => zlib.gzipSync(Buffer.from(body)).length;
const kb = (bytes: number) => `${(bytes / 1024).toFixed(2)} KB`;

test.describe('page weight', () => {
  for (const path of ['/ru', '/ru/flights']) {
    test(`${path} — what the browser is asked to download`, async ({ page }, testInfo) => {
      const response = await page.goto(path);
      const html = gzipped((await response!.body()).toString());

      const stylesheets = await page
        .locator('link[rel="stylesheet"]')
        .evaluateAll((nodes) => nodes.map((node) => (node as HTMLLinkElement).href));

      let css = 0;
      for (const href of stylesheets) {
        css += gzipped(await (await page.request.get(href)).text());
      }

      /*
       * `nomodule` scripts are left out. Next emits a ~38 KB gzipped polyfill
       * bundle marked that way, which every browser understanding ES modules
       * ignores without fetching, so counting it would describe a download
       * nobody performs.
       */
      const sources = await page
        .locator('script[src]:not([nomodule])')
        .evaluateAll((nodes) => nodes.map((node) => (node as HTMLScriptElement).src));

      let js = 0;
      for (const url of [...new Set(sources)]) {
        js += gzipped(await (await page.request.get(url)).text());
      }

      const report = `${path}  HTML ${kb(html)}  CSS ${kb(css)}  JS ${kb(js)}  (gzipped)`;
      testInfo.annotations.push({ type: 'page weight', description: report });
      console.log(report);

      // Not a ceiling — a floor under nonsense. A page that arrives empty, or
      // one that has somehow acquired a megabyte, is a bug rather than a size.
      expect(html, `${path} served no HTML`).toBeGreaterThan(1024);
      expect(html + css + js, `${path} is implausibly large`).toBeLessThan(4 * 1024 * 1024);
    });
  }

  test('the board is readable with no JavaScript at all', async ({ browser }) => {
    // What the budget used to protect, asserted directly instead. This is the
    // property that actually matters on a weak connection, and it survives the
    // ceilings being lifted.
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto('/ru/flights');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('[data-flight-row]').first()).toBeVisible();

    await context.close();
  });
});
