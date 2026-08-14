import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { requireAdmin } from '@/lib/admin/auth';
import { readAdminLocale } from '@/lib/admin/locale';
import { airportToday } from '@/lib/date';
import { env } from '@/lib/env';
import { countUnreadFeedback } from '@/lib/feedback/store';
import { listTranslationCandidates } from '@/lib/news/admin';

import { AdminNav } from '../../admin-nav';
import { PostForm } from '../post-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await readAdminLocale(), namespace: 'Admin.meta' });
  return { title: t('writePost') };
}

export const dynamic = 'force-dynamic';

export default async function NewNewsPostPage() {
  await requireAdmin('/admin/news/new');

  const t = await getTranslations({ locale: await readAdminLocale(), namespace: 'Admin.news' });

  // Offered against the default language. Choosing another in the form does not
  // re-fetch these, which is a deliberate simplification: the list is only a
  // convenience, and a post can be linked to its translation afterwards by
  // editing either one.
  const candidates = listTranslationCandidates('ru');

  return (
    <>
      <AdminNav current="news" unreadFeedback={countUnreadFeedback()} back="/admin/news/new" />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <p className="text-sm">
          <Link href="/admin/news" className="text-text-muted hover:text-text">
            ← {t('back')}
          </Link>
        </p>

        <h1 className="mt-2 text-2xl font-semibold">{t('write')}</h1>
        <p className="text-text-muted mt-2 text-sm">{t('newIntro')}</p>

        <PostForm candidates={candidates} today={airportToday(env.airportTz)} />
      </main>
    </>
  );
}
