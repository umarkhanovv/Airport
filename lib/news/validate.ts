import type { NewsLocale } from '../db/schema.ts';

/**
 * News post field validation (spec §7, plan §9.1).
 *
 * Dependency-free and free of `server-only`, like the feedback validator next
 * door: a plain function over plain data, testable without a request, a
 * database or a running server.
 */

export const NEWS_LIMITS = {
  title: { min: 3, max: 200 },
  excerpt: { max: 400 },
  /** Generous. A press release with a table of tariffs is a real news post. */
  body: { min: 10, max: 40_000 },
  coverAlt: { min: 3, max: 200 },
} as const;

const LOCALES: readonly NewsLocale[] = ['ru', 'en', 'kk'];

/** `YYYY-MM-DD`, which is what an `<input type="date">` submits. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type NewsErrorField =
  'locale' | 'title' | 'excerpt' | 'body' | 'publishedAt' | 'coverAlt' | 'cover';

/**
 * A field's problem, named rather than worded.
 *
 * This module has no locale and no business having one — it is a pure function
 * over form data, called from a Server Action and from `scripts/seed-news.mts`
 * alike. So it names the message under `Admin.news` in the catalogues, and the
 * form resolves it in whichever language the panel is being read in. The
 * length limits are not passed along: the form already imports `NEWS_LIMITS`
 * to enforce them in the browser, and re-sending a constant would be the kind
 * of duplication that drifts.
 */
export type NewsErrorKey =
  | 'errorLocale'
  | 'errorTitleRequired'
  | 'errorTitleShort'
  | 'errorTitleLong'
  | 'errorExcerptLong'
  | 'errorBodyRequired'
  | 'errorBodyShort'
  | 'errorBodyLong'
  | 'errorDateRequired'
  | 'errorDateInvalid'
  | 'errorAltRequired'
  | 'errorAltShort'
  | 'errorAltLong'
  | 'errorImageEmpty'
  | 'errorImageTooLarge'
  | 'errorImageType';

export type NewsErrors = Partial<Record<NewsErrorField, NewsErrorKey>>;

export interface NewsPostInput {
  locale: NewsLocale;
  title: string;
  excerpt: string | null;
  /** Markdown, rendered by the same MDX pipeline as the static pages. */
  body: string;
  /** `YYYY-MM-DD`. The stored value keeps a time; see `lib/news/admin.ts`. */
  publishedAt: string;
  isPublished: boolean;
  coverAlt: string | null;
  /**
   * The id of an existing post this one is a translation of, so the two share
   * a `translation_group_id` and each links to the other on the public site.
   */
  translationOf: string | null;
}

export type NewsValidationResult =
  { ok: true; value: NewsPostInput } | { ok: false; errors: NewsErrors };

/** Trims and collapses inner whitespace; "" becomes null. */
function clean(raw: FormDataEntryValue | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  return trimmed === '' ? null : trimmed;
}

/** As `clean`, but paragraphs survive — a post is not one line. */
function cleanBody(raw: FormDataEntryValue | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw
    .replace(/\r\n/g, '\n')
    .replace(/[^\S\n]+$/gm, '')
    .trim();
  return trimmed === '' ? null : trimmed;
}

export function isNewsLocale(value: unknown): value is NewsLocale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Validates one post.
 *
 * Every field is reported at once. Staff writing a press release should not
 * lose a round trip per mistake, and the form redisplays what they typed.
 *
 * `hasCover` is whether the post will have a cover image once saved — a new
 * upload, or one already stored. Alt text is required when it does: a news
 * cover is never decorative, and this is the only point at which anyone is in a
 * position to describe it.
 */
export function validateNewsPost(
  form: {
    locale?: FormDataEntryValue | null;
    title?: FormDataEntryValue | null;
    excerpt?: FormDataEntryValue | null;
    body?: FormDataEntryValue | null;
    publishedAt?: FormDataEntryValue | null;
    isPublished?: FormDataEntryValue | null;
    coverAlt?: FormDataEntryValue | null;
    translationOf?: FormDataEntryValue | null;
  },
  { hasCover }: { hasCover: boolean }
): NewsValidationResult {
  const errors: NewsErrors = {};

  const locale = form.locale;
  if (!isNewsLocale(locale)) errors.locale = 'errorLocale';

  const title = clean(form.title);
  if (title === null) errors.title = 'errorTitleRequired';
  else if (title.length < NEWS_LIMITS.title.min) errors.title = 'errorTitleShort';
  else if (title.length > NEWS_LIMITS.title.max) errors.title = 'errorTitleLong';

  const excerpt = clean(form.excerpt);
  if (excerpt !== null && excerpt.length > NEWS_LIMITS.excerpt.max) {
    errors.excerpt = 'errorExcerptLong';
  }

  const body = cleanBody(form.body);
  if (body === null) errors.body = 'errorBodyRequired';
  else if (body.length < NEWS_LIMITS.body.min) errors.body = 'errorBodyShort';
  else if (body.length > NEWS_LIMITS.body.max) errors.body = 'errorBodyLong';

  const publishedAt = clean(form.publishedAt);
  if (publishedAt === null) errors.publishedAt = 'errorDateRequired';
  else if (!DATE_RE.test(publishedAt) || Number.isNaN(Date.parse(publishedAt))) {
    errors.publishedAt = 'errorDateInvalid';
  }

  const coverAlt = clean(form.coverAlt);
  if (hasCover) {
    if (coverAlt === null) {
      errors.coverAlt = 'errorAltRequired';
    } else if (coverAlt.length < NEWS_LIMITS.coverAlt.min) {
      errors.coverAlt = 'errorAltShort';
    } else if (coverAlt.length > NEWS_LIMITS.coverAlt.max) {
      errors.coverAlt = 'errorAltLong';
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      locale: locale as NewsLocale,
      title: title!,
      excerpt,
      body: body!,
      publishedAt: publishedAt!,
      isPublished: form.isPublished === 'on' || form.isPublished === 'true',
      coverAlt: hasCover ? coverAlt : null,
      translationOf: clean(form.translationOf),
    },
  };
}
