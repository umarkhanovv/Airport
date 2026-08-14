import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { requireAdmin } from '@/lib/admin/auth';
import { readAdminLocale } from '@/lib/admin/locale';
import { airportToday } from '@/lib/date';
import { env } from '@/lib/env';
import { countUnreadFeedback } from '@/lib/feedback/store';
import { getNewsPostById, listTranslationCandidates } from '@/lib/news/admin';

import { AdminNav } from '../../admin-nav';
import { PostForm } from '../post-form';

import { DeleteForm } from './delete-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await readAdminLocale(), namespace: 'Admin.meta' });
  return { title: t('editPost') };
}

export const dynamic = 'force-dynamic';

/** The public path a published post sits at; `kk` is served under `/kz`. */
function publicPath(locale: string, slug: string): string {
  const prefix = locale === 'kk' ? 'kz' : locale;
  return `/${prefix}/news/${slug}`;
}

export default async function EditNewsPostPage({
  params,
  searchParams,
}: PageProps<'/admin/news/[id]'>) {
  const { id } = await params;
  await requireAdmin(`/admin/news/${id}`);

  const post = getNewsPostById(id);
  if (!post) notFound();

  const { confirm } = await searchParams;
  const t = await getTranslations({ locale: await readAdminLocale(), namespace: 'Admin.news' });
  const candidates = listTranslationCandidates(post.locale, post.id);

  const path = publicPath(post.locale, post.slug);

  return (
    <>
      <AdminNav
        current="news"
        unreadFeedback={countUnreadFeedback()}
        back={`/admin/news/${post.id}`}
      />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <p className="text-sm">
          <Link href="/admin/news" className="text-text-muted hover:text-text">
            ← {t('back')}
          </Link>
        </p>

        <h1 className="mt-2 text-2xl font-semibold">{t('edit')}</h1>

        <p className="text-text-muted mt-2 text-sm">
          {post.isPublished ? (
            <>
              {t('liveAt')}{' '}
              <a href={path} className="text-brand-text-strong underline">
                {path}
              </a>
            </>
          ) : (
            t('notPublished', { path })
          )}
        </p>

        {post.legacyUrl ? (
          <p className="text-text-muted mt-1 text-xs break-all">
            {t('migratedFrom', { url: post.legacyUrl })}
          </p>
        ) : null}

        <PostForm
          post={post}
          candidates={candidates}
          currentTranslationGroupId={post.translationGroupId}
          today={airportToday(env.airportTz)}
        />

        <section className="border-border mt-12 rounded-lg border border-dashed p-5">
          <h2 className="font-medium">{t('deleteHeading')}</h2>
          <p className="text-text-muted mt-1 text-sm">{t('deleteIntro')}</p>

          <DeleteForm id={post.id} title={post.title} mismatch={confirm === 'mismatch'} />
        </section>
      </main>
    </>
  );
}
