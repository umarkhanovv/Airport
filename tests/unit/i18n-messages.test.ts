import { describe, expect, it } from 'vitest';

import en from '@/messages/en.json';
import kk from '@/messages/kk.json';
import ru from '@/messages/ru.json';
import { SECTIONS } from '@/lib/constants';
import { routing } from '@/i18n/routing';

/**
 * Message-catalogue parity. Given the translation coverage found on the legacy
 * site (plan §1.3: ~22 RU pages have no EN, ~20 no KZ), gaps are the default
 * state of this project — so the UI string catalogues at least are held to
 * strict parity automatically.
 */

type Json = Record<string, unknown>;

/** Flattens to dotted paths, ignoring `_`-prefixed editorial notes. */
function keyPaths(value: Json, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    if (key.startsWith('_')) return [];
    const path = prefix ? `${prefix}.${key}` : key;
    return child !== null && typeof child === 'object' && !Array.isArray(child)
      ? keyPaths(child as Json, path)
      : [path];
  });
}

const catalogues = { ru, en, kk } as const;

describe('message catalogues', () => {
  it('cover exactly the configured locales', () => {
    expect(Object.keys(catalogues).sort()).toEqual([...routing.locales].sort());
  });

  it('have identical key sets across every locale', () => {
    const reference = keyPaths(ru as Json).sort();

    for (const [locale, catalogue] of Object.entries(catalogues)) {
      const keys = keyPaths(catalogue as Json).sort();
      const missing = reference.filter((k) => !keys.includes(k));
      const extra = keys.filter((k) => !reference.includes(k));

      expect(missing, `${locale} is missing keys`).toEqual([]);
      expect(extra, `${locale} has keys absent from ru`).toEqual([]);
    }
  });

  it('have no empty strings', () => {
    for (const [locale, catalogue] of Object.entries(catalogues)) {
      const empties = keyPaths(catalogue as Json).filter((path) => {
        const value = path
          .split('.')
          .reduce<unknown>((acc, part) => (acc as Json)?.[part], catalogue);
        return typeof value === 'string' && value.trim() === '';
      });
      expect(empties, `${locale} has empty strings`).toEqual([]);
    }
  });

  it('provide a nav label and section entry for all seven IA sections', () => {
    for (const [locale, catalogue] of Object.entries(catalogues)) {
      const keys = keyPaths(catalogue as Json);
      for (const section of SECTIONS) {
        expect(keys, `${locale} Nav.${section}`).toContain(`Nav.${section}`);
        expect(keys, `${locale} Sections.${section}.title`).toContain(`Sections.${section}.title`);
      }
    }
  });
});

describe('kazakh catalogue', () => {
  /**
   * Kazakh needs nine letters beyond Russian. This asserts the *content* uses
   * them, which is a cheap proxy for "somebody actually wrote Kazakh here
   * rather than pasting Russian". The typeface-coverage check is a separate
   * Stage 2 exit criterion (plan §6.3).
   */
  it('actually contains Kazakh-specific characters', () => {
    const text = JSON.stringify(kk);
    const kazakhOnly = ['ә', 'ғ', 'қ', 'ң', 'ө', 'ұ', 'ү', 'і'];
    const found = kazakhOnly.filter((c) => text.includes(c));
    expect(found.length, `only found ${found.join('')}`).toBeGreaterThanOrEqual(6);
  });

  it('is flagged as needing native review', () => {
    expect(Object.keys(kk)).toContain('_note');
  });
});
