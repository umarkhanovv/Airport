import { expect, test as setup } from '@playwright/test';

import { ADMIN_PASSWORD, ADMIN_STORAGE_STATE } from './admin-session';

/**
 * Signs in to the admin panel once and saves the session for reuse.
 *
 * The login rate limiter allows five attempts per IP with one back every 30
 * seconds (plan §9.1), and the whole suite comes from one address. Once enough
 * specs touched the admin panel, the sixth login in a burst was refused and
 * tests failed — the limiter behaving exactly as designed.
 *
 * Reusing one session is the fix rather than loosening the limit, which is the
 * only thing standing between a single env password and an offline-speed
 * guessing attack. Specs that test the login flow itself opt out and sign in
 * for real.
 */

setup('authenticate as admin', async ({ page }) => {
  await page.goto('/admin/login');
  await page.locator('#password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await page.context().storageState({ path: ADMIN_STORAGE_STATE });
});
