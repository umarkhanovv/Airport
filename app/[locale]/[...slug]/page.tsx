import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

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
          className="border-brand bg-surface-raised text-text-muted mt-6 border-s-4 px-4 py-3 text-sm"
        >
          {t('translationPending')}
        </p>
      )}

      {page.frontmatter.translationStatus === 'machine' && !page.isFallback && (
        <p className="border-brand bg-surface-raised text-text-muted mt-6 border-s-4 px-4 py-3 text-sm">
          {t('machineTranslated')}
        </p>
      )}

      {/*
        The legacy page this was migrated from had no body either. Saying so is
        the alternative to a page that opens blank and reads as broken — and it
        is the truth: the section exists, the airport has still to write it.
      */}
      {page.frontmatter.needsContent && page.body.trim() === '' && (
        <p className="border-border bg-surface-raised text-text-muted mt-6 rounded-lg border border-dashed px-4 py-5 text-sm">
          {t('awaitingContent')}
        </p>
      )}

      <div className="mt-6">
        <MdxContent source={page.body} />
      </div>

      {page.frontmatter.lastReviewed && (
        <p className="text-text-muted border-border mt-12 border-t pt-4 text-sm">
          {t('lastReviewed', { date: formatLongDate(page.frontmatter.lastReviewed, locale) })}
        </p>
      )}
    </article>
  );
}
