import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { NAVIGATION, navigationHrefs } from '@/lib/navigation';
import { SECTIONS } from '@/lib/constants';

/**
 * The header menu points only at pages that exist.
 *
 * `lib/navigation.ts` is hand-authored — it reproduces the legacy site's menu,
 * which cuts across the section structure — so nothing keeps it in step with
 * `content/` except this. A page renamed during the proofreading pass would
 * otherwise leave a menu entry leading to a 404, and a menu is exactly where
 * nobody looks for a broken link.
 */

const ROOT = path.resolve(__dirname, '../..');

/** Routes that are pages in `app/`, not files in `content/`. */
const APP_ROUTES = new Set(['/flights', '/news', '/contacts', ...SECTIONS.map((s) => `/${s}`)]);

function exists(href: string): boolean {
  const pathname = href.split('?')[0]!;
  if (APP_ROUTES.has(pathname)) return true;

  return fs.existsSync(path.join(ROOT, 'content', 'ru', `${pathname.replace(/^\//, '')}.mdx`));
}

describe('the header menu', () => {
  it('leads only to pages that exist', () => {
    const broken = navigationHrefs().filter((href) => !exists(href));
    expect(broken).toEqual([]);
  });

  it('reaches every page in Russian, English and Kazakh', () => {
    // The menu is one structure for all three languages; only the labels are
    // translated. A page that exists in Russian alone would 404 for the others.
    const missing: string[] = [];
    for (const href of navigationHrefs()) {
      const pathname = href.split('?')[0]!;
      if (APP_ROUTES.has(pathname)) continue;

      for (const locale of ['en', 'kk']) {
        const file = path.join(ROOT, 'content', locale, `${pathname.replace(/^\//, '')}.mdx`);
        if (!fs.existsSync(file)) missing.push(`${locale}${pathname}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('opens every panel onto its own section index', () => {
    // So the pages the legacy menu never listed — a fifth of the content tree —
    // are still one click away rather than orphaned by reproducing it.
    for (const item of NAVIGATION) {
      if (item.kind !== 'menu') continue;
      expect(APP_ROUTES.has(item.href), `${item.key} → ${item.href}`).toBe(true);
    }
  });

  it('keeps the destinations that are pages, not panels', () => {
    // The board and feedback are where someone is going, not a place to choose
    // from. There were two board entries here — Вылет and Прилёт, as the legacy
    // menu had them — until today's flights moved onto the home page, where the
    // direction tabs are the first thing a visitor meets. One link back to the
    // full board is what the menu still owes.
    const plain = NAVIGATION.filter((item) => item.kind === 'link').map((item) => item.key);
    expect(plain).toEqual(['board', 'feedback']);
  });

  it('names each entry once, so a label cannot drift between panels', () => {
    const keys = NAVIGATION.flatMap((item) =>
      item.kind === 'link' ? [item.key] : item.groups.flatMap((g) => g.links.map((l) => l.key))
    );
    expect(keys.length).toBe(new Set(keys).size);
  });
});
