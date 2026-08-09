import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { BoardControls } from '@/components/board/board-controls';
import { BoardEnhancements } from '@/components/board/board-enhancements';
import { BoardSearch } from '@/components/board/board-search';
import { FlightTable } from '@/components/board/flight-table';
import { SectionPages } from '@/components/section-pages';
import {
  BOARD_PARAMS,
  boardHref,
  kindParam,
  parseBoardState,
  searchHaystack,
  trafficToIntl,
} from '@/lib/flights/board';
import {
  getActiveSchedule,
  getBoardFlights,
  getDirectionCounts,
  getScheduleDates,
} from '@/lib/flights/queries';
import { cityDisplayName } from '@/lib/flights/cities';
import { airportToday, formatLongDate } from '@/lib/date';
import { env } from '@/lib/env';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { alternatesFor } from '@/lib/seo';

/**
 * The flight board (spec §6.4).
 *
 * Reads its entire state from the URL, so the default view is plain
 * server-rendered HTML and every filter combination is a shareable link. The
 * only JavaScript is the search box, which enhances rows that are already on
 * the page.
 */

// Which day is "today" changes daily and must never be stale; a short window
// keeps the page cacheable for the slow connections this audience is on.
export const revalidate = 60;

export async function generateMetadata(props: PageProps<'/[locale]/flights'>): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: 'Sections' });
  return {
    title: t('flights.title'),
    description: t('flights.description'),
    alternates: alternatesFor(locale as Locale, '/flights'),
  };
}

export default async function FlightsPage({
  params,
  searchParams,
}: PageProps<'/[locale]/flights'>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const state = parseBoardState(await searchParams);
  const t = await getTranslations('Board');

  const schedule = getActiveSchedule();
  const dates = getScheduleDates();

  if (!schedule || dates.length === 0) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-text text-3xl font-semibold tracking-tight sm:text-4xl">
          {t('title')}
        </h1>
        <div className="panel mt-8 p-6">
          <h2 className="text-text text-lg font-semibold">{t('noSchedule')}</h2>
          <p className="text-text-muted mt-1 text-sm">{t('noScheduleHint')}</p>
        </div>
      </div>
    );
  }

  const today = airportToday(env.airportTz);
  const weekStart = dates[0];
  const weekEnd = dates[dates.length - 1];
  const coversToday = today >= weekStart && today <= weekEnd;

  /**
   * Which day the "today" view actually shows.
   *
   * When the published schedule does not include today — nobody has uploaded
   * the new week yet — the board falls back to the first day it does have, and
   * says so. It must never label another day's flights "Today": that is how
   * someone ends up at the airport at the wrong hour (spec §6.4).
   */
  const focusedDate = state.date ?? (coversToday ? today : weekStart);

  const range =
    state.view === 'week' && !state.date
      ? { from: weekStart, to: weekEnd }
      : { from: focusedDate, to: focusedDate };

  const allFlights = getBoardFlights({
    kind: state.kind,
    from: range.from,
    to: range.to,
    intl: trafficToIntl(state.traffic),
  });

  /**
   * Search is applied on the server too, not only in the browser.
   *
   * With JavaScript disabled the form submits `?q=…` and this is the only
   * thing that filters — the client-side version is an enhancement layered on
   * top, using the identical haystack so both paths agree.
   */
  const needle = state.query.trim().toLowerCase();
  const flights = needle
    ? allFlights.filter((flight) =>
        searchHaystack({
          flightNo: flight.flightNo,
          flightNoNorm: flight.flightNoNorm,
          cityRaw: flight.cityRaw,
          cityNames: [cityDisplayName(flight.cityKey, locale as Locale, flight.cityRaw)],
        }).includes(needle)
      )
    : allFlights;

  const counts = getDirectionCounts(range.from, range.to);
  const groupByDate = range.from !== range.to;

  // Carried through the search form so a no-JS submit keeps the current view.
  const hiddenParams: Record<string, string> = {};
  if (state.kind !== 'arrival') hiddenParams[BOARD_PARAMS.kind] = kindParam(state.kind);
  if (state.view !== 'today') hiddenParams[BOARD_PARAMS.view] = state.view;
  if (state.date) hiddenParams[BOARD_PARAMS.date] = state.date;
  if (state.traffic !== 'all') hiddenParams[BOARD_PARAMS.traffic] = state.traffic;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h1 className="text-text text-3xl font-semibold tracking-tight sm:text-4xl">
          {t('title')}
        </h1>
        <p className="text-text-muted text-sm">{t('scheduledTimesNote')}</p>
      </div>

      {/* The schedule does not cover today — say so before anything else. */}
      {!coversToday && (
        <p className="panel panel-notice text-text mt-6 px-4 py-3 text-sm">
          {t('staleRange', {
            from: formatLongDate(weekStart, locale),
            to: formatLongDate(weekEnd, locale),
          })}
        </p>
      )}

      <div className="mt-8">
        <BoardControls state={state} counts={counts} />
      </div>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <BoardSearch defaultValue={state.query} hiddenParams={hiddenParams} />

        {/* Preserved from the legacy site, where the weekly workbook was the
            only way to see the schedule at all (spec §6.4). */}
        <a
          href="/api/schedule/download"
          className="text-brand-text-strong text-sm font-medium hover:underline"
          download
        >
          {t('downloadExcel')}
        </a>
      </div>

      {/* Day picker, so the week view's dates are reachable individually. */}
      {state.view === 'week' && (
        <nav aria-label={t('viewWeek')} className="-mx-4 mt-5 overflow-x-auto px-4">
          <ul className="flex min-w-max gap-1.5">
            {dates.map((date) => (
              <li key={date}>
                <Link
                  href={boardHref(state, { date: state.date === date ? null : date })}
                  aria-current={state.date === date ? 'true' : undefined}
                  className={[
                    'border-border-strong block rounded-md border px-3 py-1.5 text-sm whitespace-nowrap',
                    state.date === date
                      ? 'bg-brand text-on-brand font-semibold'
                      : 'bg-surface text-text hover:bg-surface-sunken',
                  ].join(' ')}
                >
                  {formatLongDate(date, locale)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className="mt-6">
        {flights.length === 0 ? (
          <p className="panel text-text-muted p-6 text-sm">
            {state.kind === 'arrival' ? t('noArrivalsToday') : t('noDeparturesToday')}
          </p>
        ) : (
          <>
            {!groupByDate && (
              <p className="text-text-muted mb-3 text-sm">
                {coversToday && focusedDate === today
                  ? `${t('today')} · ${formatLongDate(focusedDate, locale)}`
                  : formatLongDate(focusedDate, locale)}
              </p>
            )}
            <BoardEnhancements />
            {/* A pane of its own from 640px up — see `.board-pane`. */}
            <div className="board-pane">
              <FlightTable
                flights={flights}
                locale={locale as Locale}
                kind={state.kind}
                groupByDate={groupByDate}
              />
            </div>
          </>
        )}
      </div>

      <p className="text-text-muted mt-8 text-sm">
        {t('asOf', { date: formatLongDate(schedule.uploadedAt.slice(0, 10), locale) })}
      </p>

      {/*
        This route shadows `app/[locale]/[section]`, so the section index that
        would otherwise list them never renders — and the airlines list, cargo
        tariffs, seasonal schedule and ticket offices would be reachable only by
        typing their address.
      */}
      <SectionPages locale={locale} section="flights" className="mt-12" layout="inline" />
    </div>
  );
}
