import { expect, test } from '@playwright/test';

/**
 * Contact details on the contacts page and in the footer (spec §5.7).
 *
 * The legacy contacts page never carried an address or a telephone number —
 * they only ever appeared in the footer of every other page, which is where
 * Stage 8 recovered them from. These tests exist so that they cannot quietly
 * disappear again: a contacts page with no way to contact anyone looks
 * complete, which is exactly why nobody notices it.
 */

const LOCALES = ['/ru/contacts', '/en/contacts', '/kz/contacts'] as const;

test.describe('contact details', () => {
  test('every locale shows an address, both numbers and the e-mail', async ({ page }) => {
    for (const path of LOCALES) {
      await page.goto(path);

      // Scoped to the page body throughout: the footer carries the same number
      // and e-mail on every page, which is deliberate and covered below.
      const main = page.getByRole('main');

      // Dialable rather than merely printed: on a phone this page is the
      // shortest route to a person.
      //
      // All three numbers and both addresses, on every language version. The
      // legacy site published a different subset in each language, and a number
      // omitted because it only appeared in Kazakh is a number nobody can reach.
      for (const [label, tel] of [
        ['+7 72533 5 29 09', 'tel:+77253352909'],
        ['+7 701 234 45 17', 'tel:+77012344517'],
        ['+7 702 047 07 68', 'tel:+77020470768'],
      ] as const) {
        await expect(main.getByRole('link', { name: label }), `${path} ${label}`).toHaveAttribute(
          'href',
          tel
        );
      }

      for (const address of ['office@hsairport.kz', 'info.hsa@tia.com.kz']) {
        await expect(
          main.getByRole('link', { name: address }),
          `${path} ${address}`
        ).toHaveAttribute('href', `mailto:${address}`);
      }

      // The addresses are translated, so assert on the digits inside them —
      // the postcode and the street number survive every translation.
      await expect(main).toContainText('161200');
      await expect(main).toContainText('78');
    }
  });

  test('the labels are translated, not raw keys', async ({ page }) => {
    for (const path of LOCALES) {
      await page.goto(path);
      await expect(page.getByRole('main')).not.toContainText('Contacts.');
    }
  });

  test('the footer carries the call centre on every page, as the legacy site did', async ({
    page,
  }) => {
    await page.goto('/ru/flights');

    const footer = page.getByRole('contentinfo');
    await expect(footer.getByRole('link', { name: '+7 72533 5 29 09' })).toHaveAttribute(
      'href',
      'tel:+77253352909'
    );
    await expect(footer.getByRole('link', { name: 'office@hsairport.kz' })).toBeVisible();
  });
});

test.describe('eOtinish', () => {
  test('links to the state portal and nowhere else', async ({ page }) => {
    await page.goto('/ru/contacts');

    // The address was copied from the legacy footer rather than guessed, and
    // the host is the assertion that matters: this routes citizens to a
    // government service with a legally registered response.
    const link = page.getByRole('link', { name: 'Открыть eOtinish' });
    await expect(link).toHaveAttribute('href', 'https://eotinish.kz/');

    // Leaves the site, so it must not be able to reach back into it.
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
  });
});

test.describe('structured data', () => {
  test('publishes the address and telephone search engines will repeat', async ({ page }) => {
    await page.goto('/ru/contacts');

    const raw = await page.locator('script[type="application/ld+json"]').first().textContent();
    const data = JSON.parse(raw ?? '{}');

    expect(data['@type']).toBe('Airport');
    expect(data.telephone).toBe('+77253352909');
    expect(data.email).toBe('office@hsairport.kz');
    // The aerodrome, not the registered office in the city: this is the one a
    // visitor is being directed to.
    expect(data.address.streetAddress).toContain('Шага');
    expect(data.sameAs).toContain('https://www.facebook.com/turkistaninternationalairport');
    expect(data.sameAs).toContain('https://x.com/turkistanairprt');
  });
});
