import type { Metadata } from 'next';
import Link from 'next/link';

import { requireAdmin } from '@/lib/admin/auth';
import { airportToday } from '@/lib/date';
import { env } from '@/lib/env';
import { countUnreadFeedback } from '@/lib/feedback/store';
import { listTranslationCandidates } from '@/lib/news/admin';

import { AdminNav } from '../../admin-nav';
import { PostForm } from '../post-form';

export const metadata: Metadata = { title: 'Write a post' };

export const dynamic = 'force-dynamic';

export default async function NewNewsPostPage() {
  await requireAdmin('/admin/news/new');

  // Offered against the default language. Choosing another in the form does not
  // re-fetch these, which is a deliberate simplification: the list is only a
  // convenience, and a post can be linked to its translation afterwards by
  // editing either one.
  const candidates = listTranslationCandidates('ru');

  return (
    <>
      <AdminNav current="news" unreadFeedback={countUnreadFeedback()} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <p className="text-sm">
          <Link href="/admin/news" className="text-text-muted hover:text-text">
            ← All news
          </Link>
        </p>

        <h1 className="mt-2 text-2xl font-semibold">Write a post</h1>
        <p className="text-text-muted mt-2 text-sm">
          Nothing is public until the published box is ticked, so this can be filled in and left.
        </p>

        <PostForm candidates={candidates} today={airportToday(env.airportTz)} />
      </main>
    </>
  );
}
