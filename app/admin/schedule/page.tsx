import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { requireAdmin } from '@/lib/admin/auth';
import { readAdminLocale } from '@/lib/admin/locale';
import { getActiveSchedule } from '@/lib/flights/queries';

import { AdminNav } from '../admin-nav';

import { UploadForm } from './upload-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await readAdminLocale(), namespace: 'Admin.meta' });
  return { title: t('uploadSchedule') };
}

export const dynamic = 'force-dynamic';

export default async function UploadSchedulePage() {
  await requireAdmin('/admin/schedule');

  const t = await getTranslations({ locale: await readAdminLocale(), namespace: 'Admin.schedule' });
  const active = getActiveSchedule();

  return (
    <>
      <AdminNav current="schedule" />

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>

        <p className="text-text-muted mt-2 text-sm">
          {active
            ? t('showing', {
                count: active.entryCount,
                from: active.weekStart ?? '—',
                to: active.weekEnd ?? '—',
              })
            : t('noneYet')}
        </p>

        <UploadForm />
      </main>
    </>
  );
}
