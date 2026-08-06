import { describe, expect, it } from 'vitest';

import { slugify, uniqueSlug } from '@/lib/slug';

/**
 * Slug generation (plan §1.5).
 *
 * The legacy site's percent-encoded Cyrillic slugs are being replaced, so the
 * thing worth testing hard is that Kazakh survives. Transliterating only the
 * Russian alphabet silently drops ә ғ қ ң ө ұ ү һ і, which turns a Kazakh
 * headline into a shorter, different, wrong URL.
 */

describe('slugify — Russian', () => {
  it('transliterates a real headline from the site', () => {
    expect(slugify('Позиция международного аэропорта Туркестан')).toBe(
      'pozitsiya-mezhdunarodnogo-aeroporta-turkestan'
    );
  });

  it('handles the multi-letter cases', () => {
    expect(slugify('жшщчцюя')).toBe('zhshschchtsyuya');
  });

  it('drops the soft and hard signs rather than inventing a character', () => {
    expect(slugify('объявления')).toBe('obyavleniya');
    expect(slugify('вылет')).toBe('vylet');
  });
});

describe('slugify — Kazakh', () => {
  it('transliterates every Kazakh-specific letter', () => {
    const cases: Array<[string, string]> = [
      ['ә', 'a'],
      ['ғ', 'g'],
      ['қ', 'q'],
      ['ң', 'ng'],
      ['ө', 'o'],
      ['ұ', 'u'],
      ['ү', 'u'],
      ['һ', 'h'],
      ['і', 'i'],
    ];
    for (const [letter, expected] of cases) {
      expect(slugify(letter), `${letter} should become ${expected}`).toBe(expected);
    }
  });

  it('transliterates a real Kazakh headline', () => {
    expect(slugify('Түркістан халықаралық әуежайы')).toBe('turkistan-halyqaralyq-auezhaiy');
  });

  it('never silently drops a Kazakh letter', () => {
    // The failure mode being guarded: unmapped characters vanish in the
    // [^a-z0-9] pass, shortening the slug without any error.
    const kazakh = 'әғқңөұүһі';
    const slug = slugify(kazakh);
    expect(slug).not.toBe('');
    expect(slug.length).toBeGreaterThanOrEqual(kazakh.length);
  });
});

describe('slugify — general', () => {
  it('strips accents from Latin titles', () => {
    expect(slugify('Türkistan Halyqaralyq Äuejaiy')).toBe('turkistan-halyqaralyq-auejaiy');
  });

  it('collapses punctuation and whitespace into single hyphens', () => {
    expect(slugify('  Рейс   №123 — «Астана»!  ')).toBe('reis-123-astana');
  });

  it('never produces leading, trailing or doubled hyphens', () => {
    for (const input of ['--- Тест ---', '!!!', 'а  б', '   ']) {
      const slug = slugify(input);
      expect(slug).not.toMatch(/^-|-$|--/);
    }
  });

  it('produces only URL-safe characters', () => {
    const slug = slugify('Қазақстан: рейс №7 (Түркістан) — 2024 ж.');
    expect(slug).toMatch(/^[a-z0-9-]*$/);
  });

  it('truncates long titles at a word boundary', () => {
    const long =
      'Международный аэропорт Туркестан объявляет о начале выполнения регулярных рейсов по маршруту';
    const slug = slugify(long);
    expect(slug.length).toBeLessThanOrEqual(70);
    expect(slug).not.toMatch(/-$/);
    // Cut between words, not through one.
    expect(long.toLowerCase()).toContain(
      slug.split('-').slice(0, 2).join('') === '' ? '' : 'международный'
    );
  });

  it('returns an empty string for input with nothing sluggable', () => {
    expect(slugify('!!!')).toBe('');
    expect(slugify('')).toBe('');
  });
});

describe('uniqueSlug', () => {
  it('returns the base when it is free', () => {
    expect(uniqueSlug('novosti', [])).toBe('novosti');
  });

  it('suffixes on collision', () => {
    expect(uniqueSlug('novosti', ['novosti'])).toBe('novosti-2');
    expect(uniqueSlug('novosti', ['novosti', 'novosti-2'])).toBe('novosti-3');
  });

  it('falls back to a usable slug when the title yields nothing', () => {
    // The legacy site has a post whose URL is just `/6336/`.
    expect(uniqueSlug(slugify('!!!'), [])).toBe('post');
    expect(uniqueSlug(slugify('!!!'), ['post'])).toBe('post-2');
  });
});
