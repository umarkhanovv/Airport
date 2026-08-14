import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { ADMIN_STORAGE_STATE, useEnglishAdmin } from './admin-session';

/**
 * Accessibility — Stage 9 (plan §9.3).
 *
 * The stage's exit criterion is zero critical violations. This suite asserts
 * that automatically; the keyboard and screen-reader passes the plan also asks
 * for are manual and are recorded in the handover, because no automated check
 * substitutes for them.
 *
 * WCAG 2 A and AA only. The AAA rules are not the standard this project
 * committed to, and failing the build on them would train people to ignore it.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function scan(page: Page) {
  return new AxeBuilder({ page }).withTags(TAGS).analyze();
}

function describeViolations(results: Awaited<ReturnType<typeof scan>>): string {
  return results.violations
    .map(
      (violation) =>
        `${violation.impact ?? 'unknown'}  ${violation.id}: ${violation.help}\n` +
        violation.nodes.map((node) => `      ${node.target.join(' ')}`).join('\n')
    )
    .join('\n');
}

/** Every public surface a visitor can reach without an account. */
const PUBLIC_PAGES: Array<{ name: string; path: string }> = [
  { name: 'home', path: '/' },
  { name: 'flight board', path: '/flights?view=week&kind=departures' },
  { name: 'news list', path: '/news' },
  { name: 'contacts and feedback form', path: '/contacts' },
  { name: 'migrated content page', path: '/airport/wifi' },
  { name: 'section landing', path: '/passengers' },
  { name: 'Kazakh home', path: '/kz' },
  { name: 'not found', path: '/does-not-exist' },
];

for (const { name, path } of PUBLIC_PAGES) {
  test(`${name} has no critical or serious accessibility violations`, async ({ page }) => {
    await page.goto(path);
    const results = await scan(page);

    // Critical and serious are the ones that stop someone using the page at
    // all. Moderate and minor are reported in the message but do not fail —
    // several are unavoidable in a page built from migrated content.
    const blocking = results.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious'
    );

    expect(blocking, `${name}:\n${describeViolations(results)}`).toEqual([]);
  });
}

/**
 * Motion, and the preference not to have it.
 *
 * Both halves are asserted because the suite leans on the second one: every
 * browser it runs asks for reduced motion (see `playwright.config.ts`), which
 * is what stops an animated scroll from racing the driver's clicks. If the
 * stylesheet ever stopped honouring the preference, that would come back as a
 * flake in whichever test happened to click something below the fold — so it
 * is caught here instead, where the failure names the cause.
 */
test.describe('motion', () => {
  // Both preferences are set explicitly rather than inherited, so this says
  // what the stylesheet does regardless of how the suite is configured.
  const scrollBehaviour = async (page: Page, reducedMotion: 'reduce' | 'no-preference') => {
    await page.emulateMedia({ reducedMotion });
    await page.goto('/news');
    return page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
  };

  test('scrolling is animated by default', async ({ page }) => {
    expect(await scrollBehaviour(page, 'no-preference')).toBe('smooth');
  });

  test('and is not, for a visitor who has asked for less of it', async ({ page }) => {
    expect(await scrollBehaviour(page, 'reduce')).toBe('auto');
  });
});

test.describe('admin', () => {
  // Reuses the session from auth.setup rather than signing in: the login rate
  // limiter counts every attempt from this address across the whole suite.
  test.use({ storageState: ADMIN_STORAGE_STATE });

  test('the admin panel is accessible to the staff who have to use it', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

    const results = await scan(page);
    const blocking = results.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious'
    );

    expect(blocking, `admin overview:\n${describeViolations(results)}`).toEqual([]);
  });

  test('the news editor is accessible', async ({ page }) => {
    // The longest form in the application, and the one with a file input, a
    // fieldset and a select in it. Staff use it more than any other screen.
    await page.goto('/admin/news/new');
    await expect(page.getByRole('heading', { name: 'Write a post' })).toBeVisible();

    const results = await scan(page);
    const blocking = results.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious'
    );

    expect(blocking, `news editor:\n${describeViolations(results)}`).toEqual([]);
  });

  /**
   * The rest of the panel.
   *
   * Two of the nine admin routes were scanned and seven were not, which was
   * survivable while they were all the same flat surface and stopped being so
   * the moment the design pass changed them. These are the screens staff spend
   * their day in — the document library alone carries two hundred rows — and
   * an airport's own employees are as likely to need a screen reader as its
   * passengers.
   */
  for (const { name, path, heading } of [
    { name: 'schedule upload', path: '/admin/schedule', heading: 'Upload schedule' },
    { name: 'documents', path: '/admin/documents', heading: 'Documents' },
    { name: 'feedback inbox', path: '/admin/feedback', heading: 'Feedback' },
  ]) {
    test(`${name} is accessible`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();

      const results = await scan(page);
      const blocking = results.violations.filter(
        (violation) => violation.impact === 'critical' || violation.impact === 'serious'
      );

      expect(blocking, `${name}:\n${describeViolations(results)}`).toEqual([]);
    });
  }
});

test.describe('the sign-in screen', () => {
  // Signed out on purpose: it is the one admin screen a visitor can reach, and
  // the only one nobody is ever authenticated on while using it. The panel
  // defaults to Russian, so the language is pinned rather than assumed.
  test.beforeEach(async ({ context, baseURL }) => {
    await useEnglishAdmin(context, baseURL);
  });

  test('is accessible', async ({ page }) => {
    await page.goto('/admin/login');
    await expect(page.getByRole('heading', { name: 'Airport admin' })).toBeVisible();

    const results = await scan(page);
    const blocking = results.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious'
    );

    expect(blocking, `admin login:\n${describeViolations(results)}`).toEqual([]);
  });
});

test.describe('feedback form errors', () => {
  // Its own address, so this submission is not counted against the feedback
  // spec's budget (see tests/e2e/feedback.spec.ts).
  test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.21' } });

  test('the feedback form reports errors accessibly', async ({ page }) => {
    // An error state is a different page for accessibility purposes: the fields
    // gain aria-invalid and aria-describedby, and those associations are exactly
    // what a screen reader user depends on to correct the form.
    await page.goto('/ru/contacts');
    await page.locator('#name').fill('A');
    await page.locator('#message').fill('short');
    await page.waitForTimeout(2100);
    await page.getByRole('button', { name: 'Отправить' }).click();
    await expect(page.locator('#name-error')).toBeVisible();

    const results = await scan(page);
    const blocking = results.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious'
    );

    expect(blocking, `feedback form errors:\n${describeViolations(results)}`).toEqual([]);
  });
});
