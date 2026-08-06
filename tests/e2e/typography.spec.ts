import { expect, test } from '@playwright/test';

/**
 * Kazakh glyph coverage — a Stage 2 exit criterion (plan §6.3).
 *
 * Kazakh needs nine letters beyond Russian. Eight of them live in the
 * `cyrillic-ext` font subset; Russian fits entirely inside `cyrillic`. Subset
 * to `cyrillic` alone — which is the obvious choice for a Russian-language
 * site — and the browser silently substitutes a fallback face mid-word. On a
 * Kazakh page that looks broken in a way nobody who does not read Kazakh will
 * notice in review.
 */

const KAZAKH_ONLY = ['ә', 'ғ', 'қ', 'ң', 'ө', 'ұ', 'ү', 'һ', 'і'];

test.describe('Kazakh typography', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/kz');
    await page.evaluate(() => document.fonts.ready);
  });

  test('the webfont loads and can render every Kazakh-specific letter', async ({ page }) => {
    const missing = await page.evaluate((letters) => {
      // document.fonts.check reports whether the loaded face can render the
      // text — exactly the question, rather than a proxy for it.
      return letters.filter((ch) => !document.fonts.check('400 16px "Golos Text"', ch));
    }, KAZAKH_ONLY);

    expect(missing, `Golos Text cannot render: ${missing.join(' ')}`).toEqual([]);
  });

  test('no Kazakh letter falls back to a different face than Latin', async ({ page }) => {
    /**
     * Width comparison catches the failure `document.fonts.check` can miss:
     * the face loads, but a particular glyph is absent and the browser
     * substitutes. Each Kazakh letter is measured in Golos Text and again in a
     * deliberately nonexistent family. If the two widths match, nothing
     * rendered the glyph but the fallback.
     */
    const substituted = await page.evaluate((letters) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      const out: string[] = [];

      for (const ch of letters) {
        ctx.font = '400 64px "Golos Text", "__no_such_family__"';
        const real = ctx.measureText(ch).width;
        ctx.font = '400 64px "__no_such_family__"';
        const fallback = ctx.measureText(ch).width;
        if (real === fallback) out.push(ch);
      }
      return out;
    }, KAZAKH_ONLY);

    expect(substituted, `rendered by a fallback face: ${substituted.join(' ')}`).toEqual([]);
  });

  test('the cyrillic-ext subset is actually fetched on a Kazakh page', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('.woff2')) requests.push(r.url());
    });

    await page.goto('/kz', { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);

    expect(
      requests.some((u) => u.includes('cyrillic-ext')),
      `fonts fetched: ${requests.join(', ') || 'none'}`
    ).toBe(true);
  });

  test('renders a Kazakh pangram without fallback', async ({ page }) => {
    // Every Kazakh-specific letter in one string, injected and measured on the
    // real page rather than in isolation.
    const pangram = 'Әсем ғажайып қоңыр өзен ұшқыр үйрек һәм інжу';

    const rendered = await page.evaluate((text) => {
      const el = document.createElement('p');
      el.textContent = text;
      el.style.cssText =
        'position:fixed;left:-9999px;font:400 32px "Golos Text";white-space:nowrap';
      document.body.appendChild(el);
      const withFont = el.getBoundingClientRect().width;
      el.style.font = '400 32px "__no_such_family__"';
      const withoutFont = el.getBoundingClientRect().width;
      el.remove();
      return { withFont, withoutFont };
    }, pangram);

    expect(rendered.withFont).toBeGreaterThan(0);
    expect(rendered.withFont).not.toBeCloseTo(rendered.withoutFont, 0);
  });
});

test.describe('typography basics', () => {
  test('flight times use tabular figures so columns do not shift', async ({ page }) => {
    await page.goto('/');
    const el = page.locator('.tabular').first();
    if ((await el.count()) === 0) test.skip();

    const variant = await el.evaluate((node) => getComputedStyle(node).fontVariantNumeric);
    expect(variant).toContain('tabular-nums');
  });

  test('every font face is declared non-blocking', async ({ page }) => {
    await page.goto('/');
    const displays = await page.evaluate(() => {
      const out: string[] = [];
      document.fonts.forEach((f) => out.push(f.display));
      return out;
    });
    expect(displays.length).toBeGreaterThan(0);
    expect(displays.every((d) => d === 'swap')).toBe(true);
  });
});
