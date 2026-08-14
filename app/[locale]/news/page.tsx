import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { NewsCover } from '@/components/news-cover';
import { listNews, NEWS_PAGE_SIZE } from '@/lib/news/queries';
import type { NewsLocale } from '@/lib/db/schema';
import { formatLongDate } from '@/lib/date';
import { Link } from '@/i18n/navigation';
import { alternatesFor } from '@/lib/seo';
import type { Locale } from '@/i18n/routing';

/**
 * News list (spec §7).
 *
 * Database-backed rather than MDX, because this is the one part of the site
 * non-developers edit regularly (plan §3.2).
 */

export const revalidate = 300;

export async function generateMetadata(props: PageProps<'/[locale]/news'>): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: 'News' });
  return {
    title: t('title'),
    description: t('description'),
    alternates: alternatesFor(locale as Locale, '/news'),
  };
}

export default async function NewsPage({ params, searchParams }: PageProps<'/[locale]/news'>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const raw = (await searchParams).page;
  const page = Math.max(1, Number(Array.isArray(raw) ? raw[0] : raw) || 1);

  const t = await getTranslations('News');
  const { posts, total } = listNews(locale as NewsLocale, page);
  const lastPage = Math.max(1, Math.ceil(total / NEWS_PAGE_SIZE));

  return (
    <div>
      <h1 className="text-text text-3xl font-semibold tracking-tight sm:text-4xl">{t('title')}</h1>
      <p className="text-text-muted mt-3 max-w-2xl text-lg">{t('description')}</p>

      {posts.length === 0 ? (
        <p className="panel text-text-muted mt-8 p-6 text-sm">{t('empty')}</p>
      ) : (
        <ul className="mt-10 space-y-8">
          {posts.map((post) => (
            <li key={post.id} className="border-border border-b pb-8 last:border-0">
              {/*
                The thumbnail is not a link. The headline beside it already
                goes to the post, and a second link to the same place is a
                second tab stop and a second thing read out for no new
                information. `min-w-0` on the text column so a long unbroken
                word cannot push the image off the row.
              */}
              <article className="flex gap-4 sm:gap-6">
                {post.coverImage && (
                  <NewsCover name={post.coverImage} alt={post.coverAlt} variant="thumbnail" />
                )}
                <div className="min-w-0">
                  <p className="text-text-muted tabular text-sm">
                    <time dateTime={post.publishedAt.slice(0, 10)}>
                      {formatLongDate(post.publishedAt.slice(0, 10), locale)}
                    </time>
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight">
                    <Link href={`/news/${post.slug}`} className="text-text hover:text-brand-text">
                      {post.title}
                    </Link>
                  </h2>
                  {post.excerpt && <p className="text-text-muted mt-2 max-w-2xl">{post.excerpt}</p>}
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}

      {/* Pagination is plain links, so it works without JavaScript like the
          rest of the site. */}
      {lastPage > 1 && (
        <nav aria-label={t('pagination')} className="mt-10 flex items-center gap-3">
          {page > 1 && (
            <Link
              href={page - 1 === 1 ? '/news' : `/news?page=${page - 1}`}
              className="border-border-strong text-text hover:bg-surface-sunken rounded-md border px-3 py-1.5 text-sm"
            >
              ← {t('previous')}
            </Link>
          )}
          <span className="text-text-muted tabular text-sm">
            {t('pageOf', { page, total: lastPage })}
          </span>
          {page < lastPage && (
            <Link
              href={`/news?page=${page + 1}`}
              className="border-border-strong text-text hover:bg-surface-sunken rounded-md border px-3 py-1.5 text-sm"
            >
              {t('next')} →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
