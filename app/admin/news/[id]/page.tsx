import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { requireAdmin } from '@/lib/admin/auth';
import { airportToday } from '@/lib/date';
import { env } from '@/lib/env';
import { countUnreadFeedback } from '@/lib/feedback/store';
import { getNewsPostById, listTranslationCandidates } from '@/lib/news/admin';

import { AdminNav } from '../../admin-nav';
import { PostForm } from '../post-form';

import { DeleteForm } from './delete-form';

export const metadata: Metadata = { title: 'Edit post' };

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
  const candidates = listTranslationCandidates(post.locale, post.id);

  return (
    <>
      <AdminNav current="news" unreadFeedback={countUnreadFeedback()} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <p className="text-sm">
          <Link href="/admin/news" className="text-text-muted hover:text-text">
            ← All news
          </Link>
        </p>

        <h1 className="mt-2 text-2xl font-semibold">Edit post</h1>

        <p className="text-text-muted mt-2 text-sm">
          {post.isPublished ? (
            <>
              Live at{' '}
              <a
                href={publicPath(post.locale, post.slug)}
                className="text-brand-text-strong underline"
              >
                {publicPath(post.locale, post.slug)}
              </a>
            </>
          ) : (
            <>Not published. It will appear at {publicPath(post.locale, post.slug)}.</>
          )}
        </p>

        {post.legacyUrl ? (
          <p className="text-text-muted mt-1 text-xs break-all">Migrated from {post.legacyUrl}</p>
        ) : null}

        <PostForm
          post={post}
          candidates={candidates}
          currentTranslationGroupId={post.translationGroupId}
          today={airportToday(env.airportTz)}
        />

        <section className="border-border mt-12 rounded-lg border border-dashed p-5">
          <h2 className="font-medium">Delete this post</h2>
          <p className="text-text-muted mt-1 text-sm">
            Permanent. To take a post off the public site while keeping it, unpublish it instead —
            that is reversible, and one click on the news list.
          </p>

          <DeleteForm id={post.id} title={post.title} mismatch={confirm === 'mismatch'} />
        </section>
      </main>
    </>
  );
}
