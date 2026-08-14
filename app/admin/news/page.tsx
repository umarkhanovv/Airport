import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { requireAdmin } from '@/lib/admin/auth';
import { readAdminLocale } from '@/lib/admin/locale';
import { countUnreadFeedback } from '@/lib/feedback/store';
import { listAllNews } from '@/lib/news/admin';

import { AdminNav } from '../admin-nav';

import { toggleNewsPublished } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await readAdminLocale(), namespace: 'Admin.meta' });
  return { title: t('news') };
}

export const dynamic = 'force-dynamic';

/** Two letters, not a translated language name: the column is 4rem wide. */
const LOCALE_LABELS: Record<string, string> = { ru: 'RU', en: 'EN', kk: 'KK' };

/**
 * The news list (spec §7).
 *
 * Drafts are shown alongside published posts, which is the whole point of the
 * screen: the public site never returns a draft, so this is the only place one
 * is visible. Every title is rendered as text — the same rule as the feedback
 * inbox, and posts migrated from the legacy site carry its markup habits.
 */
export default async function AdminNewsPage({ searchParams }: PageProps<'/admin/news'>) {
  await requireAdmin('/admin/news');

  const { saved, deleted } = await searchParams;
  const t = await getTranslations({ locale: await readAdminLocale(), namespace: 'Admin.news' });

  const posts = listAllNews();
  const drafts = posts.filter((post) => !post.isPublished).length;

  return (
    <>
      <AdminNav current="news" unreadFeedback={countUnreadFeedback()} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <Link
            href="/admin/news/new"
            className="bg-brand text-on-brand focus:ring-focus ms-auto rounded-md px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-offset-2 focus:outline-none"
          >
            {t('write')}
          </Link>
        </div>

        {saved ? (
          <p
            role="status"
            className="border-arrival bg-arrival-soft mt-4 rounded-md border px-4 py-3 text-sm"
          >
            {t('saved')}
          </p>
        ) : null}
        {deleted ? (
          <p role="status" className="panel mt-4 px-4 py-3 text-sm">
            {t('deleted')}
          </p>
        ) : null}

        <p className="text-text-muted mt-2 text-sm">
          {posts.length === 0 ? t('none') : t('count', { count: posts.length, drafts })}
        </p>

        {posts.length === 0 ? (
          <p className="border-border text-text-muted mt-6 rounded-lg border border-dashed p-6 text-sm">
            {t('emptyHint')}
          </p>
        ) : (
          <div className="panel mt-6 overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="bg-surface-sunken text-text-muted text-left">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">
                    {t('columnDate')}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    {t('columnLang')}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    {t('columnHeadline')}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    {t('columnStatus')}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    <span className="sr-only">{t('columnActions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-surface">
                {posts.map((post) => (
                  <tr
                    key={post.id}
                    data-testid="news-row"
                    data-published={post.isPublished ? 'true' : 'false'}
                    className="border-border border-t"
                  >
                    <td className="tabular px-4 py-2 whitespace-nowrap">
                      {post.publishedAt.slice(0, 10)}
                    </td>
                    <td className="px-4 py-2">{LOCALE_LABELS[post.locale] ?? post.locale}</td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/admin/news/${post.id}`}
                        className="text-brand-text-strong hover:underline"
                      >
                        {post.title}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      {post.isPublished ? (
                        <span className="bg-arrival-soft text-arrival rounded px-1.5 py-0.5 text-xs font-medium">
                          {t('statusPublished')}
                        </span>
                      ) : (
                        <span className="border-border-strong text-text-muted rounded border px-1.5 py-0.5 text-xs font-medium">
                          {t('statusDraft')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <form action={toggleNewsPublished}>
                        <input type="hidden" name="id" value={post.id} />
                        <input
                          type="hidden"
                          name="publish"
                          value={post.isPublished ? 'false' : 'true'}
                        />
                        <button
                          type="submit"
                          className="border-border-strong focus:ring-focus rounded-md border px-3 py-1 text-xs focus:ring-2 focus:outline-none"
                        >
                          {post.isPublished ? t('unpublish') : t('publish')}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
