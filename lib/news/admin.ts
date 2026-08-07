import 'server-only';

import crypto from 'node:crypto';

import { and, desc, eq, ne } from 'drizzle-orm';

import { getDb } from '../db/index.ts';
import { newsPosts, type NewsLocale } from '../db/schema.ts';
import { slugify, uniqueSlug } from '../slug.ts';

import { deleteNewsCover } from './images.ts';
import type { NewsPostInput } from './validate.ts';

/**
 * Admin-side news reads and writes (spec §7, plan §9.1).
 *
 * Kept apart from `lib/news/queries.ts`, which answers only "what should the
 * public site show" and filters every query to published posts. This file
 * deliberately does not: an editor has to be able to see and work on a draft,
 * and mixing the two in one module is how a draft eventually leaks onto the
 * public site.
 */

export interface AdminNewsRow {
  id: string;
  slug: string;
  locale: NewsLocale;
  title: string;
  publishedAt: string;
  isPublished: boolean;
  translationGroupId: string;
  updatedAt: string;
}

export interface AdminNewsPost extends AdminNewsRow {
  excerpt: string | null;
  body: string;
  coverImage: string | null;
  coverAlt: string | null;
  legacyUrl: string | null;
}

/** Every post, drafts included, newest first. */
export function listAllNews(): AdminNewsRow[] {
  return getDb()
    .select({
      id: newsPosts.id,
      slug: newsPosts.slug,
      locale: newsPosts.locale,
      title: newsPosts.title,
      publishedAt: newsPosts.publishedAt,
      isPublished: newsPosts.isPublished,
      translationGroupId: newsPosts.translationGroupId,
      updatedAt: newsPosts.updatedAt,
    })
    .from(newsPosts)
    .orderBy(desc(newsPosts.publishedAt), desc(newsPosts.updatedAt))
    .all();
}

export function getNewsPostById(id: string): AdminNewsPost | null {
  const row = getDb().select().from(newsPosts).where(eq(newsPosts.id, id)).limit(1).all()[0];
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
    isPublished: row.isPublished,
    translationGroupId: row.translationGroupId,
    legacyUrl: row.legacyUrl,
    updatedAt: row.updatedAt,
  };
}

/**
 * Posts that a new one could be filed as a translation of.
 *
 * Only other languages are offered: two posts in the same language are two
 * stories, not one story twice, and joining them would make the public page
 * offer a reader "also available in Russian" pointing at Russian.
 */
export function listTranslationCandidates(
  locale: NewsLocale,
  excludeId?: string
): Array<{ id: string; title: string; locale: NewsLocale; translationGroupId: string }> {
  const where = excludeId
    ? and(ne(newsPosts.locale, locale), ne(newsPosts.id, excludeId))
    : ne(newsPosts.locale, locale);

  return getDb()
    .select({
      id: newsPosts.id,
      title: newsPosts.title,
      locale: newsPosts.locale,
      translationGroupId: newsPosts.translationGroupId,
    })
    .from(newsPosts)
    .where(where)
    .orderBy(desc(newsPosts.publishedAt))
    .limit(100)
    .all();
}

/** Slugs already taken in one locale, so a new one can avoid them. */
function takenSlugs(locale: NewsLocale): string[] {
  return getDb()
    .select({ slug: newsPosts.slug })
    .from(newsPosts)
    .where(eq(newsPosts.locale, locale))
    .all()
    .map((row) => row.slug);
}

/**
 * The group a post belongs to.
 *
 * Following the chosen post's group rather than its id means a third language
 * can be added by pointing at either of the first two, and all three end up
 * together — rather than the third forming a pair with one and orphaning the
 * other.
 */
function groupFor(translationOf: string | null): string {
  if (!translationOf) return crypto.randomUUID();

  const row = getDb()
    .select({ group: newsPosts.translationGroupId })
    .from(newsPosts)
    .where(eq(newsPosts.id, translationOf))
    .limit(1)
    .all()[0];

  return row?.group ?? crypto.randomUUID();
}

/**
 * A stored timestamp for a date the editor chose.
 *
 * The column holds a full ISO instant — the migrated posts carry the time they
 * were published on the legacy site — but the form asks for a date, because
 * that is what a newsroom means by a publication date. Editing a post without
 * touching its date therefore has to leave the existing instant alone, or every
 * edit would silently reshuffle same-day posts against each other.
 */
function timestampFor(date: string, previous?: string): string {
  if (previous && previous.slice(0, 10) === date) return previous;
  return `${date}T00:00:00.000Z`;
}

export function createNewsPost(input: NewsPostInput, coverImage: string | null): string {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  getDb()
    .insert(newsPosts)
    .values({
      id,
      slug: uniqueSlug(slugify(input.title), takenSlugs(input.locale)),
      locale: input.locale,
      translationGroupId: groupFor(input.translationOf),
      title: input.title,
      excerpt: input.excerpt,
      body: input.body,
      coverImage,
      coverAlt: coverImage ? input.coverAlt : null,
      publishedAt: timestampFor(input.publishedAt),
      isPublished: input.isPublished,
      legacyUrl: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return id;
}

/**
 * Updates a post in place.
 *
 * The slug and the locale are not editable, and the form does not offer them.
 * Both are in the published URL, and a URL that has been sent to a passenger,
 * indexed by a search engine or printed on a notice is a promise. A headline
 * typo is fixed by fixing the headline; the address stays where it was.
 *
 * `newCover` distinguishes three cases the form can express: leave the existing
 * image alone (`undefined`), replace it (a filename), or remove it (`null`).
 */
export function updateNewsPost(
  id: string,
  input: NewsPostInput,
  newCover: string | null | undefined
): void {
  const existing = getNewsPostById(id);
  if (!existing) return;

  const coverImage = newCover === undefined ? existing.coverImage : newCover;

  getDb()
    .update(newsPosts)
    .set({
      title: input.title,
      excerpt: input.excerpt,
      body: input.body,
      coverImage,
      coverAlt: coverImage ? input.coverAlt : null,
      publishedAt: timestampFor(input.publishedAt, existing.publishedAt),
      isPublished: input.isPublished,
      translationGroupId: input.translationOf
        ? groupFor(input.translationOf)
        : existing.translationGroupId,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(newsPosts.id, id))
    .run();

  // Only once the row no longer refers to it. A crash between the two leaves an
  // orphaned file, which costs disk; the other order leaves a row pointing at
  // nothing, which costs a broken image on the public site.
  if (newCover !== undefined && existing.coverImage && existing.coverImage !== coverImage) {
    deleteNewsCover(existing.coverImage);
  }
}

export function setNewsPublished(id: string, isPublished: boolean): void {
  getDb()
    .update(newsPosts)
    .set({ isPublished, updatedAt: new Date().toISOString() })
    .where(eq(newsPosts.id, id))
    .run();
}

/** Deletes a post and the cover image nothing else refers to. */
export function deleteNewsPost(id: string): void {
  const existing = getNewsPostById(id);
  if (!existing) return;

  getDb().delete(newsPosts).where(eq(newsPosts.id, id)).run();
  deleteNewsCover(existing.coverImage);
}
