import { describe, expect, it } from 'vitest';

import { NEWS_LIMITS, isNewsLocale, validateNewsPost } from '@/lib/news/validate';

/**
 * News post validation (Stage 6, plan §9.1).
 *
 * These run against plain objects with no request, database or server, which is
 * the reason the validator is a pure function in the first place.
 */

const VALID = {
  locale: 'ru',
  title: 'Аэропорт открыл новый маршрут',
  excerpt: 'Рейсы начнутся в июне.',
  body: 'С 1 июня открывается регулярный рейс в Стамбул.',
  publishedAt: '2026-06-01',
  isPublished: 'on',
  coverAlt: null,
  translationOf: null,
};

const NO_COVER = { hasCover: false };

describe('validateNewsPost', () => {
  it('accepts a complete post', () => {
    const result = validateNewsPost(VALID, NO_COVER);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe('Аэропорт открыл новый маршрут');
    expect(result.value.isPublished).toBe(true);
    expect(result.value.publishedAt).toBe('2026-06-01');
  });

  it('treats an absent checkbox as a draft', () => {
    // An unticked checkbox is not submitted at all, which is the normal way a
    // post stays a draft — it must never be read as "published".
    const result = validateNewsPost({ ...VALID, isPublished: null }, NO_COVER);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isPublished).toBe(false);
  });

  it('reports every problem at once rather than the first', () => {
    const result = validateNewsPost(
      { ...VALID, title: '', body: '', publishedAt: 'yesterday' },
      NO_COVER
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(['body', 'publishedAt', 'title']);
  });

  it('refuses a locale the site does not serve', () => {
    const result = validateNewsPost({ ...VALID, locale: 'tr' }, NO_COVER);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.locale).toBeDefined();
  });

  it('rejects a date that is not one', () => {
    for (const publishedAt of ['01.06.2026', '2026-6-1', '2026-13-01', 'soon']) {
      const result = validateNewsPost({ ...VALID, publishedAt }, NO_COVER);
      expect(result.ok, publishedAt).toBe(false);
    }
  });

  it('keeps paragraphs in the body and collapses them in the headline', () => {
    const result = validateNewsPost(
      {
        ...VALID,
        title: '  Новый   маршрут  ',
        body: 'Первый абзац.\r\n\r\nВторой абзац.   \n',
      },
      NO_COVER
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe('Новый маршрут');
    expect(result.value.body).toBe('Первый абзац.\n\nВторой абзац.');
  });

  it('normalises an empty summary to null rather than an empty string', () => {
    const result = validateNewsPost({ ...VALID, excerpt: '   ' }, NO_COVER);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.excerpt).toBeNull();
  });

  it('enforces the length limits', () => {
    const long = (n: number) => 'а'.repeat(n);

    expect(validateNewsPost({ ...VALID, title: 'ab' }, NO_COVER).ok).toBe(false);
    expect(
      validateNewsPost({ ...VALID, title: long(NEWS_LIMITS.title.max + 1) }, NO_COVER).ok
    ).toBe(false);
    expect(
      validateNewsPost({ ...VALID, excerpt: long(NEWS_LIMITS.excerpt.max + 1) }, NO_COVER).ok
    ).toBe(false);
    expect(validateNewsPost({ ...VALID, body: 'коротко' }, NO_COVER).ok).toBe(false);
  });

  describe('cover images', () => {
    it('requires a description when there is an image', () => {
      const result = validateNewsPost({ ...VALID, coverAlt: null }, { hasCover: true });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors.coverAlt).toBeDefined();
    });

    it('accepts a described image', () => {
      const result = validateNewsPost(
        { ...VALID, coverAlt: 'Самолёт на перроне' },
        { hasCover: true }
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.coverAlt).toBe('Самолёт на перроне');
    });

    it('drops a description typed for an image that is not there', () => {
      // Otherwise removing the picture leaves its alt text behind, describing
      // nothing, to be inherited by whatever image is uploaded next.
      const result = validateNewsPost({ ...VALID, coverAlt: 'Самолёт' }, NO_COVER);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.coverAlt).toBeNull();
    });
  });
});

describe('isNewsLocale', () => {
  it('accepts the three the site serves and nothing else', () => {
    expect(['ru', 'en', 'kk'].every(isNewsLocale)).toBe(true);
    expect(['kz', 'tr', '', null, undefined, 42].some(isNewsLocale)).toBe(false);
  });
});
