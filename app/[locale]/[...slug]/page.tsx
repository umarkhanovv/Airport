import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { DocumentList } from '@/components/document-list';
import { MdxContent } from '@/components/mdx-content';
import { getPage, listSlugs } from '@/lib/content';
import { formatLongDate } from '@/lib/date';
import { routing } from '@/i18n/routing';
import { alternatesFor } from '@/lib/seo';
import type { Locale } from '@/i18n/routing';

/**
 * Static information pages, resolved from `content/{locale}/…`.
 *
 * This sits below the `[section]` route, so the seven single-segment IA
 * sections keep their own pages and everything deeper lands here.
 */

/**
 * A ceiling on how stale one of these can get, and it is a safety net rather
 * than the mechanism.
 *
 * The text comes from `content/` and only changes on deploy, but the documents
 * underneath it come from the database and change whenever staff edit them —
 * which is what `revalidatePath` in `app/admin/documents/actions.ts` is for,
 * and it is normally immediate: 34 ms on an idle server, 357 ms under a
 * saturated one, measured.
 *
 * Normally. When two edits to the same page overlap, a regeneration already in
 * flight can finish after the second edit invalidated the page and write its
 * older render back as current. Six editors working on one page lost a quarter
 * of their renames that way. Without a lifetime these pages have none — they
 * are prerendered with `initialRevalidateSeconds: false` — so a lost edit was
 * not delayed, it was permanent: the page kept serving `x-nextjs-cache: HIT`
 * with the old title until somebody happened to edit that page again. That is
 * a plausible afternoon at the airport, not a contrived race: staff upload
 * thirty notices and correct the titles one after another while the public is
 * reading the page.
 *
 * Five minutes does not close the race. It bounds it, which is the part worth
 * having: an edit that loses is an edit that is late, not one that is lost. It
 * also stops `s-maxage` being a year, so a caching proxy in front of this —
 * which the deployment notes expect — cannot hold a withdrawn notice forever.
 */
export const revalidate = 300;

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => listSlugs(locale).map((slug) => ({ locale, slug })));
}

export async function generateMetadata(props: PageProps<'/[locale]/[...slug]'>): Promise<Metadata> {
  const { locale, slug } = await props.params;
  const page = getPage(locale, slug, routing.defaultLocale);
  if (!page) return {};

  return {
    title: page.frontmatter.title,
    description: page.frontmatter.description,
    alternates: alternatesFor(locale as Locale, `/${slug.join('/')}`),
  };
}

export default async function ContentPage({ params }: PageProps<'/[locale]/[...slug]'>) {
  const { locale, slug } = await params;
  const page = getPage(locale, slug, routing.defaultLocale);
  if (!page || page.frontmatter.draft) notFound();

  setRequestLocale(locale);
  const t = await getTranslations('Content');

  return (
    // A measure of roughly 70 characters. Long-form policy text is unreadable
    // at the full grid width, whatever the layout does around it.
    <article className="max-w-[68ch]">
      <h1 className="text-text text-3xl font-semibold tracking-tight sm:text-4xl">
        {page.frontmatter.title}
      </h1>

      {page.frontmatter.description && (
        <p className="text-text-muted mt-3 text-lg">{page.frontmatter.description}</p>
      )}

      {/*
        Never fall back silently. Serving Russian to someone who asked for
        English without saying so is worse than an honest notice — they cannot
        tell whether the page is untranslated or they misread it.
      */}
      {page.isFallback && (
        <p
          lang={page.fallbackLocale}
          className="glass border-s-brand text-text-muted mt-6 rounded-lg border-s-4 px-4 py-3 text-sm"
        >
          {t('translationPending')}
        </p>
      )}

      {page.frontmatter.translationStatus === 'machine' && !page.isFallback && (
        <p className="glass border-s-brand text-text-muted mt-6 rounded-lg border-s-4 px-4 py-3 text-sm">
          {t('machineTranslated')}
        </p>
      )}

      {/*
        The legacy page this was migrated from had no body either. Saying so is
        the alternative to a page that opens blank and reads as broken — and it
        is the truth: the section exists, the airport has still to write it.
      */}
      {page.frontmatter.needsContent && page.body.trim() === '' && (
        <p className="glass text-text-muted mt-6 rounded-xl border-dashed px-4 py-5 text-sm">
          {t('awaitingContent')}
        </p>
      )}

      <div className="mt-6">
        <MdxContent source={page.body} />
      </div>

      {/*
        Files published on this page, from the database rather than the
        repository — procurement notices change weekly, and committing them
        would mean a deploy every time a tender opens.
      */}
      <DocumentList locale={locale} pagePath={slug.join('/')} />

      {page.frontmatter.lastReviewed && (
        <p className="text-text-muted border-border mt-12 border-t pt-4 text-sm">
          {t('lastReviewed', { date: formatLongDate(page.frontmatter.lastReviewed, locale) })}
        </p>
      )}
    </article>
  );
}
