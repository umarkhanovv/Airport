import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { ADMIN_STORAGE_STATE, useEnglishAdmin } from './admin-session';

/** The same workbook `admin.spec.ts` uploads, and the one the suite seeds from. */
const SAMPLE = path.resolve(__dirname, '../../data/sample_weekly_schedule.xlsx');

/**
 * Correcting the live board (wave 4).
 *
 * The property this file exists for is the one that would fail silently: a
 * correction has to survive the workbook being uploaded again. Everything else
 * here is a form, but that one is the promise the whole `flight_edits` table
 * was built to keep — and the failure mode is a staff member's typing quietly
 * disappearing on a Monday morning.
 *
 * These run in serial. They share the one live schedule and the one set of
 * edits, so a parallel worker reverting a flight while another is asserting on
 * it would be a genuine race rather than a flake worth retrying.
 */

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ context, baseURL }) => {
  await useEnglishAdmin(context, baseURL);
});

test.describe('the flight editor is staff-only', () => {
  test('redirects to login when signed out', async ({ page }) => {
    await page.goto('/admin/flights');
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});

test.describe('correcting a flight', () => {
  test.use({
    storageState: ADMIN_STORAGE_STATE,
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.41' },
  });

  /** The day the editor opens on, and the row it lands on first. */
  async function firstRow(page: Page) {
    await page.goto('/admin/flights');
    const row = page.locator('[data-testid="admin-flight-row"]').first();
    await expect(row).toBeVisible();
    return {
      row,
      flight: (await row.getAttribute('data-flight')) ?? '',
      date: new URL(page.url()).searchParams.get('date'),
    };
  }

  test('an actual time reaches the public board and survives a re-upload', async ({ page }) => {
    const { row, flight } = await firstRow(page);

    // The day being edited, read off the picker rather than assumed — the
    // seeded workbook covers April 2024, so it is never today.
    const day = await page
      .locator('nav[aria-label] a[aria-current="true"]')
      .first()
      .getAttribute('href');
    const date = new URLSearchParams(day?.split('?')[1] ?? '').get('date')!;

    await row.locator('input[name="actualTime"]').fill('23:59');
    await row.locator('input[name="note"]').fill('E2E note');
    await row.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status')).toContainText('Saved');

    // The public board, on the day that was edited.
    const boardRow = page.locator(`[data-flight-row]`, { hasText: 'E2E note' });
    await page.goto(`/en/flights?date=${date}`);
    await expect(boardRow.first()).toContainText('23:59');

    /*
     * The re-upload. This is the whole point of the separate table: publishing
     * writes an entirely fresh set of flight rows, and a correction stored on
     * one of them would go with the old set.
     */
    await page.goto('/admin/schedule');
    await page.locator('#file').setInputFiles(SAMPLE);
    await page
      .getByRole('button', { name: /Upload|Continue|Check/ })
      .first()
      .click();
    await page
      .getByRole('button', { name: /Publish/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/admin\?published=1/);

    await page.goto(`/en/flights?date=${date}`);
    await expect(boardRow.first(), 'the correction did not survive the re-upload').toContainText(
      '23:59'
    );

    // And it is still attached to the same flight in the panel.
    await page.goto(`/admin/flights?date=${date}`);
    const same = page.locator(`[data-testid="admin-flight-row"][data-flight="${flight}"]`);
    await expect(same.locator('input[name="actualTime"]')).toHaveValue('23:59');
  });

  test('reverting brings the workbook value back', async ({ page }) => {
    const { row } = await firstRow(page);
    const original = await row.locator('input[name="city"]').inputValue();

    await row.locator('input[name="city"]').fill('NOWHERE');
    await row.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status')).toContainText('Saved');

    const edited = page.locator('[data-testid="admin-flight-row"]').first();
    await expect(edited.locator('input[name="city"]')).toHaveValue('NOWHERE');

    await edited.getByRole('button', { name: 'Restore from the file' }).click();
    await expect(page.getByRole('status')).toContainText('discarded');

    const reverted = page.locator('[data-testid="admin-flight-row"]').first();
    await expect(reverted.locator('input[name="city"]')).toHaveValue(original);
    // The note and actual time went with the correction, being fields the
    // workbook never had.
    await expect(reverted.locator('input[name="actualTime"]')).toHaveValue('');
  });

  /*
   * Saving a note must not pin every other field.
   *
   * The form posts every box, so a naive save records the flight number, the
   * city, the aircraft and the time as overrides as well. The marker that says
   * "a human changed this" would then appear on every field of every edited
   * flight and mean nothing — and, far worse, those values would be pinned: a
   * later workbook correcting the city would be silently overruled by a value
   * nobody chose.
   */
  test('records an override only where a human actually disagreed', async ({ page }) => {
    const { row } = await firstRow(page);

    await row.locator('input[name="note"]').fill('only the note changed');
    await row.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status')).toContainText('Saved');

    const saved = page.locator('[data-testid="admin-flight-row"]').first();
    await expect(saved.locator('input[name="note"]')).toHaveValue('only the note changed');
    // The bullet beside a label is the "overruled the file" marker.
    await expect(saved.locator('label', { hasText: '●' })).toHaveCount(0);

    // Now genuinely disagree with the file, and exactly one marker appears.
    await saved.locator('input[name="aircraft"]').fill('SOMETHING ELSE');
    await saved.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status')).toContainText('Saved');

    const changed = page.locator('[data-testid="admin-flight-row"]').first();
    await expect(changed.locator('label', { hasText: '●' })).toHaveCount(1);

    await changed.getByRole('button', { name: 'Restore from the file' }).click();
  });

  test('refuses a time it cannot read, and saves nothing', async ({ page }) => {
    const { row } = await firstRow(page);
    const before = await row.locator('input[name="city"]').inputValue();

    await row.locator('input[name="city"]').fill('SHOULD NOT SAVE');
    await row.locator('input[name="actualTime"]').fill('half past nine');
    await row.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByRole('alert').first()).toBeVisible();

    // Nothing was written: the city is as it was, not as it was typed.
    const after = page.locator('[data-testid="admin-flight-row"]').first();
    await expect(after.locator('input[name="city"]')).toHaveValue(before);
  });

  test('takes a flight off the board and puts it back', async ({ page }) => {
    const { row, flight } = await firstRow(page);
    const date = new URL(page.url()).searchParams.get('date') ?? '';

    /*
     * Matched on the search haystack rather than on the visible text. The panel
     * knows the flight as `IQ365` and the board prints it as `IQ 365`, so
     * filtering by the normalised string finds nothing — and an assertion that
     * a row is absent passes perfectly well when it was never going to match.
     */
    const onBoard = page.locator(`[data-flight-row][data-search*="${flight.toLowerCase()}"]`);

    await row.getByRole('button', { name: 'Take off the board' }).click();
    await expect(page.getByRole('status')).toContainText('off the board');

    const marked = page.locator(`[data-testid="admin-flight-row"][data-flight="${flight}"]`);
    await expect(marked).toHaveAttribute('data-removed', 'true');

    // Gone from the public board, not merely hidden in the panel.
    await page.goto(`/en/flights?date=${date}`);
    await expect(onBoard).toHaveCount(0);

    await page.goto(`/admin/flights?date=${date}`);
    await marked.getByRole('button', { name: 'Put back on the board' }).click();
    await expect(marked).toHaveAttribute('data-removed', 'false');

    await page.goto(`/en/flights?date=${date}`);
    await expect(onBoard).toHaveCount(1);

    // Leave the day as it was found.
    await page.goto(`/admin/flights?date=${date}`);
    await marked.getByRole('button', { name: 'Restore from the file' }).click();
  });

  test('adds a flight no workbook contains, then discards it', async ({ page }) => {
    await page.goto('/admin/flights');
    const date = new URL(page.url()).searchParams.get('date') ?? '';

    const add = page.locator('details', { hasText: 'Add a departure' }).first();
    await add.locator('summary').click();
    await add.locator('input[name="flightNo"]').fill('ZZ 001');
    await add.locator('input[name="city"]').fill('NOWHERE');
    await add.locator('input[name="scheduledTime"]').fill('23:45');
    await add.getByRole('button', { name: 'Add flight' }).click();
    await expect(page.getByRole('status')).toContainText('added');

    const added = page.locator('[data-testid="admin-flight-row"][data-flight="ZZ001"]');
    await expect(added).toBeVisible();

    const onBoard = page.locator('[data-flight-row][data-search*="zz001"]');

    await page.goto(`/en/flights?kind=departures&date=${date}`);
    await expect(onBoard).toHaveCount(1);

    await page.goto(`/admin/flights?date=${date}`);
    await added.getByRole('button', { name: 'Delete this added flight' }).click();
    await expect(added).toHaveCount(0);

    await page.goto(`/en/flights?kind=departures&date=${date}`);
    await expect(onBoard).toHaveCount(0);
  });

  test('works with no JavaScript at all', async ({ browser, baseURL }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      storageState: ADMIN_STORAGE_STATE,
      extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.42' },
    });
    await useEnglishAdmin(context, baseURL);
    const page = await context.newPage();

    await page.goto('/admin/flights');
    const row = page.locator('[data-testid="admin-flight-row"]').first();
    await row.locator('input[name="note"]').fill('typed without scripting');
    await row.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByRole('status')).toContainText('Saved');
    await expect(
      page.locator('[data-testid="admin-flight-row"]').first().locator('input[name="note"]')
    ).toHaveValue('typed without scripting');

    // Put it back, so the next run starts clean.
    await page
      .locator('[data-testid="admin-flight-row"]')
      .first()
      .getByRole('button', { name: 'Restore from the file' })
      .click();

    await context.close();
  });
});
