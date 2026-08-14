import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { requireAdmin } from '@/lib/admin/auth';
import { readAdminLocale } from '@/lib/admin/locale';
import { listScheduleUploads } from '@/lib/admin/queries';
import { formatAirportDateTime } from '@/lib/date';
import { env } from '@/lib/env';
import { countUnreadFeedback } from '@/lib/feedback/store';
import { getActiveSchedule } from '@/lib/flights/queries';

import { AdminNav } from './admin-nav';
import { ScheduleRowActions } from './schedule-row-actions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await readAdminLocale(), namespace: 'Admin.meta' });
  return { title: t('overview') };
}

/** Reads the session cookie and live database state. Never prerendered. */
export const dynamic = 'force-dynamic';

/** One notice per outcome, keyed by what the redirect said happened. */
const SCHEDULE_NOTICES: Record<string, string> = {
  live: 'noticeLive',
  cleared: 'noticeCleared',
  deleted: 'noticeDeleted',
  missing: 'noticeMissing',
};

/** Airport time, not the server's. See `formatAirportDateTime`. */
const formatTimestamp = (iso: string) => formatAirportDateTime(iso, env.airportTz);

export default async function AdminDashboardPage({ searchParams }: PageProps<'/admin'>) {
  await requireAdmin('/admin');

  const { published, schedule: scheduleNotice, id: mismatchId } = await searchParams;
  const t = await getTranslations({
    locale: await readAdminLocale(),
    namespace: 'Admin.dashboard',
  });

  const active = getActiveSchedule();
  const history = listScheduleUploads();

  const noticeKey = SCHEDULE_NOTICES[scheduleNotice as string];

  return (
    <>
      <AdminNav current="dashboard" unreadFeedback={countUnreadFeedback()} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>

        {published ? (
          <p
            role="status"
            className="border-arrival bg-arrival-soft mt-4 rounded-md border px-4 py-3 text-sm"
          >
            {t('published')}
          </p>
        ) : null}

        {/*
          Each notice says what the public site is doing now rather than that
          the click worked — the click is not the thing anybody is worried about.
        */}
        {noticeKey ? (
          <p
            role="status"
            className="border-arrival bg-arrival-soft mt-4 rounded-md border px-4 py-3 text-sm"
          >
            {t(noticeKey)}
          </p>
        ) : null}

        <section className="mt-8">
          <h2 className="text-lg font-medium">{t('liveHeading')}</h2>

          {active ? (
            <dl className="panel mt-3 grid grid-cols-2 gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-text-muted">{t('week')}</dt>
                <dd className="mt-0.5 font-medium">
                  {active.weekStart ?? '—'} … {active.weekEnd ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-text-muted">{t('flights')}</dt>
                <dd data-testid="live-flights" className="mt-0.5 font-medium">
                  {active.entryCount}
                </dd>
              </div>
              <div>
                <dt className="text-text-muted">{t('publishedAt')}</dt>
                <dd className="mt-0.5 font-medium">{formatTimestamp(active.uploadedAt)}</dd>
              </div>
              <div>
                <dt className="text-text-muted">{t('file')}</dt>
                <dd className="mt-0.5 font-medium break-all">{active.originalFilename}</dd>
              </div>
            </dl>
          ) : (
            <p className="border-border text-text-muted mt-3 rounded-lg border border-dashed p-6 text-sm">
              {t('noneYet')}
            </p>
          )}

          <Link
            href="/admin/schedule"
            className="bg-brand text-on-brand focus:ring-focus mt-4 inline-block rounded-md px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-offset-2 focus:outline-none"
          >
            {t('uploadNew')}
          </Link>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-medium">{t('historyHeading')}</h2>
          <p className="text-text-muted mt-1 text-sm">{t('historyIntro')}</p>

          {history.length === 0 ? (
            <p className="text-text-muted mt-3 text-sm">{t('historyEmpty')}</p>
          ) : (
            <div className="panel mt-3 overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="bg-surface-sunken text-text-muted text-left">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-medium">
                      {t('columnUploaded')}
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      {t('columnWeek')}
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      {t('columnFlights')}
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      {t('columnWarnings')}
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      {t('columnFile')}
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      {t('columnActions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-surface">
                  {history.map((row) => (
                    <tr key={row.id} className="border-border border-t">
                      <td className="px-4 py-2 whitespace-nowrap">
                        {formatTimestamp(row.uploadedAt)}
                        {row.isActive ? (
                          <span className="bg-arrival-soft text-arrival ms-2 rounded px-1.5 py-0.5 text-xs font-medium">
                            {t('liveBadge')}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {row.weekStart ?? '—'} … {row.weekEnd ?? '—'}
                      </td>
                      <td className="px-4 py-2">{row.entryCount}</td>
                      <td className="px-4 py-2">{row.warnings.length}</td>
                      <td className="px-4 py-2 break-all">{row.originalFilename}</td>
                      <td className="px-4 py-2">
                        <ScheduleRowActions
                          id={row.id}
                          isActive={row.isActive}
                          weekStart={row.weekStart}
                          mismatch={scheduleNotice === 'mismatch' && mismatchId === row.id}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
