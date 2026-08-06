import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { MdxContent } from '@/components/mdx-content';
import { getNewsPost, getTranslations as getPostTranslations } from '@/lib/news/queries';
import type { NewsLocale } from '@/lib/db/schema';
import { formatLongDate } from '@/lib/date';
import { Link } from '@/i18n/navigation';
import { LOCALE_LABELS, type Locale } from '@/i18n/routing';

export const revalidate = 300;

export async function generateMetadata(
  props: PageProps<'/[locale]/news/[slug]'>
): Promise<Metadata> {
  const { locale, slug } = await props.params;
  const post = getNewsPost(locale as NewsLocale, slug);
  if (!post) return {};

  return {
    title: post.title,
    description: post.excerpt ?? undefined,
    openGraph: {
      title: post.title,
      description: post.excerpt ?? undefined,
      type: 'article',
      publishedTime: post.publishedAt,
    },
  };
}

export default async function NewsPostPage({ params }: PageProps<'/[locale]/news/[slug]'>) {
  const { locale, slug } = await params;
  const post = getNewsPost(locale as NewsLocale, slug);
  if (!post) notFound();

  setRequestLocale(locale);
  const t = await getTranslations('News');

  const translations = getPostTranslations(post.translationGroupId, locale as NewsLocale);

  return (
    <article className="max-w-[68ch]">
      <p className="text-text-muted tabular text-sm">
        <time dateTime={post.publishedAt.slice(0, 10)}>
          {formatLongDate(post.publishedAt.slice(0, 10), locale)}
        </time>
      </p>

      <h1 className="text-text mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
        {post.title}
      </h1>

      {post.excerpt && <p className="text-text-muted mt-4 text-lg">{post.excerpt}</p>}

      {/*
        Which other languages this story exists in.
        Most posts exist in only one (17 RU / 7 KK / 3 EN on the legacy site),
        so saying nothing would leave a reader guessing whether they had missed
        a switcher somewhere.
      */}
      {translations.length > 0 && (
        <p
          data-translations=""
          className="border-border bg-surface-raised text-text-muted mt-6 rounded-md border px-4 py-2.5 text-sm"
        >
          {t('alsoAvailableIn')}{' '}
          {translations.map((translation, index) => (
            <span key={translation.locale}>
              {index > 0 && ', '}
              <Link
                href={`/news/${translation.slug}`}
                locale={translation.locale as Locale}
                lang={translation.locale}
                className="text-brand-text-strong underline underline-offset-2"
              >
                {LOCALE_LABELS[translation.locale as Locale]}
              </Link>
            </span>
          ))}
        </p>
      )}

      <div className="mt-8">
        <MdxContent source={post.body} />
      </div>

      <p className="border-border mt-12 border-t pt-4">
        <Link href="/news" className="text-brand-text-strong text-sm hover:underline">
          ← {t('backToNews')}
        </Link>
      </p>
    </article>
  );
}
