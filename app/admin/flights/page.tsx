import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { requireAdmin } from '@/lib/admin/auth';
import { readAdminLocale } from '@/lib/admin/locale';
import { airportToday, formatLongDate } from '@/lib/date';
import { env } from '@/lib/env';
import { countUnreadFeedback } from '@/lib/feedback/store';
import { applyEdits } from '@/lib/flights/overlay';
import {
  getActiveSchedule,
  getScheduleDates,
  getWorkbookFlightsForDate,
  listFlightEdits,
} from '@/lib/flights/queries';

import { AdminNav } from '../admin-nav';

import { AddFlightForm } from './add-flight-form';
import { FlightRowForm } from './flight-row-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await readAdminLocale(), namespace: 'Admin.meta' });
  return { title: t('flights') };
}

export const dynamic = 'force-dynamic';

/**
 * Correcting the live board, one day at a time (wave 4).
 *
 * The workbook says what flights exist and this says what is true about them
 * today. `lib/db/schema.ts` explains why the two are stored apart; the effect
 * here is that nothing on this screen destroys anything. Every control is
 * reversible, so none of them asks for a typed confirmation — that is reserved
 * for deleting an upload, which really is irreversible.
 *
 * One day at a time on purpose. A week of flights is seventy-odd forms on one
 * page, and the reason to open this screen is almost always something happening
 * now.
 */
export default async function AdminFlightsPage({ searchParams }: PageProps<'/admin/flights'>) {
  await requireAdmin('/admin/flights');

  const params = await searchParams;
  const locale = await readAdminLocale();
  const t = await getTranslations({ locale, namespace: 'Admin.flights' });

  const schedule = getActiveSchedule();
  const dates = getScheduleDates();
  const today = airportToday(env.airportTz);

  const one = (name: string): string | null => {
    const value = params[name];
    const first = Array.isArray(value) ? value[0] : value;
    return typeof first === 'string' && first !== '' ? first : null;
  };

  const outcome = one('saved');
  const touched = one('flight');
  const invalidField = one('field');

  if (!schedule || dates.length === 0) {
    return (
      <>
        <AdminNav current="flights" unreadFeedback={countUnreadFeedback()} />
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="border-border text-text-muted mt-6 rounded-lg border border-dashed p-6 text-sm">
            {t('noSchedule')}
          </p>
        </main>
      </>
    );
  }

  /*
   * Which day to show.
   *
   * Today when the live schedule covers it, and otherwise the first day it does
   * — the same rule the public board follows, and for the same reason: a screen
   * that silently opened on a day the board is not showing would have staff
   * correcting flights nobody can see.
   */
  const requested = one('date');
  const fallback = dates.includes(today) ? today : dates[0];
  const date = requested && dates.includes(requested) ? requested : fallback;

  const workbook = getWorkbookFlightsForDate(date);
  const edits = listFlightEdits(date);
  const editByFlight = new Map(edits.map((edit) => [`${edit.kind}|${edit.flightNoNorm}`, edit]));

  /*
   * The merged board, plus the flights it is deliberately not showing.
   *
   * `applyEdits` drops tombstoned rows, which is right for the public board and
   * wrong here — staff have to be able to put one back. So the removed ones are
   * added on afterwards, marked, rather than the merge being taught a second
   * mode it would only ever use once.
   */
  const live = applyEdits(workbook, edits);
  const liveKeys = new Set(live.map((flight) => `${flight.kind}|${flight.flightNoNorm}`));

  const hidden = [
    ...workbook.filter((flight) => !liveKeys.has(`${flight.kind}|${flight.flightNoNorm}`)),
    // An added flight that was then removed has no workbook row to fall back
    // on, so it is rebuilt from its own patch.
    ...edits
      .filter((edit) => edit.isAdded && edit.isRemoved)
      .map((edit) => applyEdits([], [{ ...edit, isRemoved: false }])[0])
      .filter(Boolean),
  ];

  const rows = [...live, ...hidden];
  const arrivals = rows.filter((flight) => flight.kind === 'arrival');
  const departures = rows.filter((flight) => flight.kind === 'departure');

  const notice = outcome && outcome !== 'invalid' && outcome !== 'invalidNew' ? outcome : null;

  const section = async (kind: 'arrival' | 'departure', list: typeof rows) => (
    <section className="mt-8">
      <h2 className="text-lg font-medium">
        {kind === 'arrival' ? t('arrivals') : t('departures')}
      </h2>

      {list.length === 0 ? (
        <p className="text-text-muted mt-2 text-sm">{t('noneThisDay')}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {list.map((flight) => (
            <FlightRowForm
              key={`${flight.kind}-${flight.flightNoNorm}`}
              flight={flight}
              workbook={
                workbook.find(
                  (row) => row.kind === flight.kind && row.flightNoNorm === flight.flightNoNorm
                ) ?? null
              }
              edit={editByFlight.get(`${flight.kind}|${flight.flightNoNorm}`) ?? null}
              // Only the row the server just refused wears the error.
              invalidField={touched === flight.flightNoNorm ? invalidField : null}
            />
          ))}
        </ul>
      )}

      <AddFlightForm
        date={date}
        kind={kind}
        invalidField={outcome === 'invalidNew' ? invalidField : null}
      />
    </section>
  );

  return (
    <>
      <AdminNav current="flights" unreadFeedback={countUnreadFeedback()} back="/admin/flights" />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-text-muted mt-2 text-sm">{t('intro')}</p>

        {notice ? (
          <p
            role="status"
            className="border-arrival bg-arrival-soft mt-4 rounded-md border px-4 py-3 text-sm"
          >
            {t(`notice_${notice}`)}
          </p>
        ) : null}

        {outcome === 'invalid' || outcome === 'invalidNew' ? (
          <p
            role="alert"
            className="border-brand text-text mt-4 rounded-md border px-4 py-3 text-sm"
          >
            {t('noticeInvalid')}
          </p>
        ) : null}

        {/* Days the live schedule covers, and only those — a flight corrected
            on a day the board is not showing is a correction nobody sees. */}
        <nav aria-label={t('dayPicker')} className="-mx-4 mt-6 overflow-x-auto px-4">
          <ul className="flex min-w-max gap-1.5">
            {dates.map((day) => (
              <li key={day}>
                <Link
                  href={`/admin/flights?date=${day}`}
                  aria-current={day === date ? 'true' : undefined}
                  className={[
                    'border-border-strong block rounded-md border px-3 py-1.5 text-sm whitespace-nowrap',
                    day === date
                      ? 'bg-brand text-on-brand font-semibold'
                      : 'bg-surface text-text hover:bg-surface-sunken',
                  ].join(' ')}
                >
                  {formatLongDate(day, locale)}
                  {day === today ? ` · ${t('todayLabel')}` : ''}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {await section('arrival', arrivals)}
        {await section('departure', departures)}
      </main>
    </>
  );
}
