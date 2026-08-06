import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { ADMIN_STORAGE_STATE } from './admin-session';

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
