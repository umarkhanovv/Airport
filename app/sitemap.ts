import type { MetadataRoute } from 'next';

import { listSlugs } from '@/lib/content';
import { listNewsSlugs } from '@/lib/news/queries';
import { alternatesFor, urlFor } from '@/lib/seo';
import { SECTIONS } from '@/lib/constants';
import { routing, type Locale } from '@/i18n/routing';

/**
 * sitemap.xml (plan Stage 9).
 *
 * Every public URL, in all three languages, with `alternates.languages` so a
 * crawler is told about the translations from the sitemap as well as from the
 * page. Admin is absent by construction: nothing under `/admin` is enumerated
 * here, and robots.txt disallows it (plan §9.1).
 *
 * Built from the same sources the router uses — the content tree, the section
 * list and the news table — so a page cannot be published without appearing
 * here.
 */

export const dynamic = 'force-dynamic';

/** Paths that exist as routes rather than as content files. */
const STATIC_PATHS = ['/', '/flights', '/news', '/contacts'] as const;

function entry(path: string, priority: number, changeFrequency: 'daily' | 'weekly' | 'monthly') {
  return routing.locales.map((locale) => ({
    url: urlFor(locale as Locale, path),
    lastModified: new Date(),
    changeFrequency,
    priority,
    alternates: { languages: alternatesFor(locale as Locale, path).languages },
  }));
}

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

  for (const path of STATIC_PATHS) {
    // The board changes weekly with the schedule upload; the home page carries
    // it, so both are crawled more often than the static pages.
    const frequency = path === '/' || path === '/flights' ? 'daily' : 'monthly';
    entries.push(...entry(path, path === '/' ? 1 : 0.8, frequency));
  }

  for (const section of SECTIONS) {
    if (STATIC_PATHS.includes(`/${section}` as (typeof STATIC_PATHS)[number])) continue;
    entries.push(...entry(`/${section}`, 0.7, 'monthly'));
  }

  // Content pages. Enumerated from the default locale only: a translation that
  // exists is reachable through the alternates, and one that does not falls
  // back to Russian rather than being a distinct URL worth crawling.
  for (const slug of listSlugs(routing.defaultLocale)) {
    entries.push(...entry(`/${slug.join('/')}`, 0.6, 'monthly'));
  }

  for (const locale of routing.locales) {
    for (const slug of listNewsSlugs(locale as 'ru' | 'en' | 'kk')) {
      entries.push({
        url: urlFor(locale as Locale, `/news/${slug}`),
        lastModified: new Date(),
        changeFrequency: 'monthly',
        priority: 0.5,
      });
    }
  }

  return entries;
}
