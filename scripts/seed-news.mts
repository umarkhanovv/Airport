/**
 * Seeds news from the live site.
 *
 *   npm run news:seed            # scrape and import
 *   npm run news:seed -- --dry-run
 *
 * A bounded first pass at what Stage 8 does properly for the whole site: 27
 * posts, fetched from the legacy sitemap, converted to Markdown and stored
 * with their original URL so redirects remain possible.
 *
 * Two things this deliberately does NOT do:
 *
 *  - Guess translation groupings. It links versions of a story only when the
 *    legacy slugs match across locales, which covers the two stories that
 *    genuinely exist in all three languages. Anything else is left ungrouped
 *    for a human to link in the admin panel, because a wrong grouping shows a
 *    reader the wrong article.
 *  - Publish automatically. Everything lands unpublished; spec §12 requires a
 *    human to read each item, and the legacy content includes machine
 *    translations and stale announcements.
 */
import crypto from 'node:crypto';
import path from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';

import * as schema from '../lib/db/schema.ts';
import { newsPosts, type NewsLocale } from '../lib/db/schema.ts';
import { env } from '../lib/env.ts';
import { slugify, uniqueSlug } from '../lib/slug.ts';

const SITEMAP = 'https://hsairport.kz/post-sitemap.xml';
const dryRun = process.argv.includes('--dry-run');

interface Scraped {
  legacyUrl: string;
  locale: NewsLocale;
  /** Last path segment, decoded — used to match translations. */
  legacySlug: string;
  title: string;
  body: string;
  excerpt: string;
  publishedAt: string;
}

function localeOf(url: string): NewsLocale {
  if (url.includes('/en/')) return 'en';
  if (url.includes('/kz/')) return 'kk';
  return 'ru';
}

function decodeSlug(url: string): string {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  try {
    return decodeURIComponent(segments.at(-1) ?? '');
  } catch {
    return segments.at(-1) ?? '';
  }
}

function stripTags(html: string): string {
  return html
    .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/(p|div|h[1-6]|li|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n\n');
}

async function scrape(url: string): Promise<Scraped | null> {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) return null;
  const html = await response.text();

  const title =
    html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ??
    html.match(/<title>([^<]+)<\/title>/)?.[1] ??
    '';

  const published =
    html.match(/<meta property="article:published_time" content="([^"]+)"/)?.[1] ??
    html.match(/"datePublished"\s*:\s*"([^"]+)"/)?.[1] ??
    new Date().toISOString();

  // The Porto theme wraps post content in .entry-content; fall back to <main>.
  const region =
    html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i)?.[1] ??
    html.match(/<main[\s\S]*?>([\s\S]*?)<\/main>/i)?.[1] ??
    '';

  const body = stripTags(region);
  const cleanTitle = stripTags(title).split(' - ')[0].trim();

  if (!cleanTitle) return null;

  return {
    legacyUrl: url,
    locale: localeOf(url),
    legacySlug: decodeSlug(url),
    title: cleanTitle,
    body: body || cleanTitle,
    excerpt: body.split('\n\n')[0]?.slice(0, 200) ?? '',
    publishedAt: published,
  };
}

// ---------------------------------------------------------------------------

console.log(`Fetching ${SITEMAP} …`);
const sitemap = await (await fetch(SITEMAP, { signal: AbortSignal.timeout(20_000) })).text();
const urls = [...sitemap.matchAll(/<loc><!\[CDATA\[([^\]]+)\]\]><\/loc>/g)].map((m) => m[1]);
console.log(`Found ${urls.length} posts.\n`);

const scraped: Scraped[] = [];
for (const url of urls) {
  try {
    const post = await scrape(url);
    if (post) {
      scraped.push(post);
      console.log(`  [${post.locale}] ${post.title.slice(0, 62)}`);
    } else {
      console.log(`  [skip] ${url.slice(0, 70)}`);
    }
  } catch (cause) {
    console.log(`  [fail] ${url.slice(0, 60)} — ${cause instanceof Error ? cause.message : cause}`);
  }
}

// Group translations only where the legacy slug matches across locales.
const groupBySlug = new Map<string, string>();
for (const post of scraped) {
  if (!groupBySlug.has(post.legacySlug)) groupBySlug.set(post.legacySlug, crypto.randomUUID());
}

const byLocale = new Map<NewsLocale, Set<string>>();
const rows = scraped.map((post) => {
  const taken = byLocale.get(post.locale) ?? new Set<string>();
  const slug = uniqueSlug(slugify(post.title), taken);
  taken.add(slug);
  byLocale.set(post.locale, taken);

  return {
    id: crypto.randomUUID(),
    slug,
    locale: post.locale,
    translationGroupId: groupBySlug.get(post.legacySlug)!,
    title: post.title,
    excerpt: post.excerpt || null,
    body: post.body,
    coverImage: null,
    coverAlt: null,
    publishedAt: post.publishedAt,
    // Nothing goes live until a human has read it (spec §12 step 3).
    isPublished: false,
    legacyUrl: post.legacyUrl,
  };
});

const counts = rows.reduce<Record<string, number>>((acc, r) => {
  acc[r.locale] = (acc[r.locale] ?? 0) + 1;
  return acc;
}, {});
const grouped = [...groupBySlug.values()].filter(
  (id) => rows.filter((r) => r.translationGroupId === id).length > 1
).length;

console.log(`\nScraped ${rows.length} posts:`, counts);
console.log(`Translation groups spanning more than one language: ${grouped}`);
console.log('All rows are UNPUBLISHED — review each in the admin panel before publishing.\n');

for (const row of rows) {
  console.log(`  ${row.locale}  /news/${row.slug}`);
}

if (dryRun) {
  console.log('\nDry run — nothing written.\n');
  process.exit(0);
}

const sqlite = new Database(env.paths.database);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
const db = drizzle(sqlite, { schema });
migrate(db, { migrationsFolder: path.join(process.cwd(), 'lib/db/migrations') });

db.transaction((tx) => {
  // Re-runnable: replace anything previously imported from the legacy site,
  // and leave posts written in the admin panel alone.
  for (const row of rows) {
    if (row.legacyUrl) tx.delete(newsPosts).where(eq(newsPosts.legacyUrl, row.legacyUrl)).run();
  }
  for (let i = 0; i < rows.length; i += 50) {
    tx.insert(newsPosts)
      .values(rows.slice(i, i + 50))
      .run();
  }
});

sqlite.close();
console.log(`Imported ${rows.length} posts into ${env.paths.database}\n`);
