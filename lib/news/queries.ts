import 'server-only';

import { and, asc, count, desc, eq, ne } from 'drizzle-orm';

import { getDb } from '../db/index.ts';
import { newsPosts, type NewsLocale } from '../db/schema.ts';

/**
 * Read-side queries for news (spec §7).
 *
 * Only published posts are ever returned to the public site. Drafts exist so
 * the airport can prepare an announcement before it is live, and a query that
 * forgot the filter would leak one.
 */

export const NEWS_PAGE_SIZE = 10;

export interface NewsListItem {
  id: string;
  slug: string;
  locale: string;
  title: string;
  excerpt: string | null;
  coverImage: string | null;
  coverAlt: string | null;
  publishedAt: string;
}

export interface NewsDetail extends NewsListItem {
  body: string;
  translationGroupId: string;
  legacyUrl: string | null;
}

/** One page of published posts for a locale, newest first. */
export function listNews(locale: NewsLocale, page = 1): { posts: NewsListItem[]; total: number } {
  const db = getDb();
  const where = and(eq(newsPosts.locale, locale), eq(newsPosts.isPublished, true));

  const [{ total }] = db.select({ total: count() }).from(newsPosts).where(where).all();

  const posts = db
    .select({
      id: newsPosts.id,
      slug: newsPosts.slug,
      locale: newsPosts.locale,
      title: newsPosts.title,
      excerpt: newsPosts.excerpt,
      coverImage: newsPosts.coverImage,
      coverAlt: newsPosts.coverAlt,
      publishedAt: newsPosts.publishedAt,
    })
    .from(newsPosts)
    .where(where)
    .orderBy(desc(newsPosts.publishedAt), asc(newsPosts.id))
    .limit(NEWS_PAGE_SIZE)
    .offset((Math.max(1, page) - 1) * NEWS_PAGE_SIZE)
    .all();

  return { posts, total };
}

/**
 * The newest few posts, for the home page.
 *
 * Its own query rather than `listNews(locale, 1).posts.slice(0, 3)`, which
 * would fetch ten rows and run a `COUNT(*)` over the table to show three and a
 * link. The index `news_posts_locale_published` covers this exactly.
 *
 * There is no fallback to another language: an English reader sees English
 * posts or none. That is deliberate everywhere else in news and stays true
 * here — showing Russian text under an English heading is worse than showing
 * nothing — but it does mean this block is empty far more often on `/en` than
 * on `/`, which is why the caller renders nothing at all when it comes back
 * empty rather than an "no news yet" notice on the busiest page of the site.
 */
export function listLatestNews(locale: NewsLocale, limit = 3): NewsListItem[] {
  return getDb()
    .select({
      id: newsPosts.id,
      slug: newsPosts.slug,
      locale: newsPosts.locale,
      title: newsPosts.title,
      excerpt: newsPosts.excerpt,
      coverImage: newsPosts.coverImage,
      coverAlt: newsPosts.coverAlt,
      publishedAt: newsPosts.publishedAt,
    })
    .from(newsPosts)
    .where(and(eq(newsPosts.locale, locale), eq(newsPosts.isPublished, true)))
    .orderBy(desc(newsPosts.publishedAt), asc(newsPosts.id))
    .limit(limit)
    .all();
}

export function getNewsPost(locale: NewsLocale, slug: string): NewsDetail | null {
  const rows = getDb()
    .select()
    .from(newsPosts)
    .where(
      and(eq(newsPosts.locale, locale), eq(newsPosts.slug, slug), eq(newsPosts.isPublished, true))
    )
    .limit(1)
    .all();

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    slug: row.slug,
    locale: row.locale,
    title: row.title,
    excerpt: row.excerpt,
    body: row.body,
    coverImage: row.coverImage,
    coverAlt: row.coverAlt,
    publishedAt: row.publishedAt,
    translationGroupId: row.translationGroupId,
    legacyUrl: row.legacyUrl,
  };
}

/**
 * The same story in other languages.
 *
 * Given the coverage on the legacy site (17 RU / 7 KK / 3 EN), most posts will
 * return an empty list — which is exactly why the reader needs to be told
 * which languages a story *does* exist in, rather than being left to guess.
 */
export function getTranslations(
  translationGroupId: string,
  excludeLocale: NewsLocale
): Array<{ locale: string; slug: string; title: string }> {
  return getDb()
    .select({ locale: newsPosts.locale, slug: newsPosts.slug, title: newsPosts.title })
    .from(newsPosts)
    .where(
      and(
        eq(newsPosts.translationGroupId, translationGroupId),
        ne(newsPosts.locale, excludeLocale),
        eq(newsPosts.isPublished, true)
      )
    )
    .all();
}

/** Every published slug for a locale — used for static generation. */
export function listNewsSlugs(locale: NewsLocale): string[] {
  return getDb()
    .select({ slug: newsPosts.slug })
    .from(newsPosts)
    .where(and(eq(newsPosts.locale, locale), eq(newsPosts.isPublished, true)))
    .all()
    .map((r) => r.slug);
}
