import { getTranslations } from 'next-intl/server';

import { formatLongDate } from '@/lib/date';
import { NewsCover } from '@/components/news-cover';
import { listLatestNews } from '@/lib/news/queries';
import { Link } from '@/i18n/navigation';
import type { NewsLocale } from '@/lib/db/schema';
import type { Locale } from '@/i18n/routing';

/**
 * The three newest stories, at the foot of the home page.
 *
 * The board answers the question almost everyone arrives with; this answers the
 * second one — whether anything has changed. Three, because a home page that
 * lists ten is a news site, and this is a timetable with news on it.
 *
 * Renders nothing at all when there are none. An English or Kazakh visitor
 * often has no posts in their language (there is no fallback, by design), and
 * an empty "no news yet" panel on the busiest page of the site is an apology
 * nobody needed — unlike the flight board, where saying "no schedule" is the
 * honest answer to what the visitor came for.
 */
export async function NewsPreview({ locale }: { locale: Locale }) {
  const t = await getTranslations('News');
  const posts = listLatestNews(locale as NewsLocale, 3);

  if (posts.length === 0) return null;

  return (
    <section aria-labelledby="home-news" className="mt-16">
      <h2 id="home-news" className="text-text text-2xl font-semibold tracking-tight">
        {t('title')}
      </h2>

      {/*
        The same shape as /news — date above title, excerpt under it — because
        recognising the list when you arrive on the full page is worth more
        than a card grid that looks different for no reason.
      */}
      <ul className="mt-6 space-y-6">
        {posts.map((post) => (
          <li key={post.id} className="border-border border-b pb-6 last:border-0 last:pb-0">
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
                <h3 className="mt-1 text-lg font-semibold tracking-tight">
                  <Link href={`/news/${post.slug}`} className="text-text hover:text-brand-text">
                    {post.title}
                  </Link>
                </h3>
                {post.excerpt && (
                  <p className="text-text-muted mt-1 line-clamp-2 max-w-2xl text-sm">
                    {post.excerpt}
                  </p>
                )}
              </div>
            </article>
          </li>
        ))}
      </ul>

      <Link
        href="/news"
        className="text-brand-text-strong mt-6 inline-block text-sm font-medium hover:underline"
      >
        {t('backToNews')} →
      </Link>
    </section>
  );
}
