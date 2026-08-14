import { getTranslations } from 'next-intl/server';

import { BoardEnhancements } from '@/components/board/board-enhancements';
import { FlightTable } from '@/components/board/flight-table';
import { getActiveSchedule, getDirectionCounts, getFlightsForDate } from '@/lib/flights/queries';
import { airportNowTime, airportToday, formatLongDate } from '@/lib/date';
import { env } from '@/lib/env';
import { Link } from '@/i18n/navigation';
import type { FlightKind } from '@/lib/flights/types';
import type { Locale } from '@/i18n/routing';

/**
 * Today's flights, on the home page.
 *
 * Spec §11 asks the home page to open with the board rather than a wall of
 * menu. It used to open with a *summary* of the board — two columns of four
 * flights in a shape found nowhere else on the site — and, whenever the
 * uploaded week had rolled past, with a paragraph explaining that there was no
 * schedule for today. A visitor arriving for the one thing this site exists to
 * tell them met an apology.
 *
 * So it is the real board now: the same `FlightTable` as `/flights`, the same
 * direction tabs, the same row actions. Only today, and only one direction at a
 * time — the tabs lead to `/flights`, where the week view, the search and the
 * workbook download live.
 *
 * The time is the largest element on the page. On a site whose entire job is
 * telling someone when their flight is, the digits are the content; everything
 * else is annotation.
 */
export async function FlightPreview({ locale }: { locale: Locale }) {
  const t = await getTranslations('Board');
  const schedule = getActiveSchedule();
  const today = airportToday(env.airportTz);

  // No schedule published yet — say so plainly rather than showing an
  // ambiguous empty table (spec §6.4: honesty over appearance).
  if (!schedule) {
    return (
      <div className="panel p-6">
        <h2 className="text-text text-lg font-semibold">{t('noSchedule')}</h2>
        <p className="text-text-muted mt-1 text-sm">{t('noScheduleHint')}</p>
      </div>
    );
  }

  /**
   * The published schedule does not cover today.
   *
   * This is the state whenever nobody has uploaded the new week yet, and it is
   * the most dangerous one on the site: showing last week's flights under a
   * heading that says "Today" would send someone to the airport at the wrong
   * hour. So we name the week the data actually covers and show no times at
   * all (spec §6.4 — honesty over appearance).
   *
   * It stays a notice rather than a board for exactly that reason. The board
   * cannot render flights nobody has uploaded, and an empty table with no
   * explanation is worse than a sentence that explains.
   */
  const covers =
    schedule.weekStart &&
    schedule.weekEnd &&
    today >= schedule.weekStart &&
    today <= schedule.weekEnd;

  if (!covers) {
    return (
      <div className="panel p-6">
        <h2 className="text-text text-lg font-semibold">{t('staleTitle')}</h2>
        <p className="text-text-muted mt-1 text-sm">
          {schedule.weekStart && schedule.weekEnd
            ? t('staleRange', {
                from: formatLongDate(schedule.weekStart, locale),
                to: formatLongDate(schedule.weekEnd, locale),
              })
            : t('noScheduleHint')}
        </p>
        <Link
          href="/flights"
          className="text-brand-text-strong mt-4 inline-block text-sm font-medium hover:underline"
        >
          {t('seeFullBoard')} →
        </Link>
      </div>
    );
  }

  const now = airportNowTime(env.airportTz);

  /** Still to come; if the day is over, the whole day rather than nothing. */
  const forDirection = (kind: FlightKind) => {
    const all = getFlightsForDate(today, kind);
    const upcoming = all.filter((flight) => (flight.scheduledTime ?? '') >= now);
    return upcoming.length > 0 ? upcoming : all;
  };

  const counts = getDirectionCounts(today, today);

  return (
    <section aria-labelledby="home-board" className="home-board space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id="home-board" className="text-text text-lg font-semibold">
          {t('today')}
        </h2>
        <p className="text-text-muted text-sm">
          {formatLongDate(today, locale)}
          {' · '}
          {/* Times are scheduled, never live. Saying so once, here, is the
              honest framing the whole board depends on (spec §6.4). */}
          <span>{t('scheduledTimesNote')}</span>
        </p>
      </div>

      {/*
        Both directions ship, and CSS shows one.

        The tabs used to be links to `/flights`, so switching direction on the
        home page meant leaving it. Making them read `?kind=` instead would have
        worked and cost the whole page its cache: reading `searchParams` opts a
        route out of static generation, and this is the most-visited page on a
        site whose readers are on weak connections.

        So: two radios, two labels, two tables, and `:checked ~` decides which
        table is displayed. Today is a handful of rows, so the second table is
        nearly free; it needs no JavaScript, which the board is required to
        manage anyway; and the page stays prerendered. The cost is that the
        chosen direction is not in the URL — on `/flights`, where a view is
        worth sharing, it still is.
      */}
      <div>
        <input
          type="radio"
          name="home-direction"
          id="home-arrivals"
          className="sr-only"
          defaultChecked
        />
        <input type="radio" name="home-direction" id="home-departures" className="sr-only" />

        <nav aria-label={t('directionLabel')}>
          <ul className="border-border flex gap-1 border-b">
            <li>
              <label htmlFor="home-arrivals" className="home-tab home-tab-arrival">
                {t('arrivals')}
                <span className="tabular text-text-muted ms-2 text-sm font-normal">
                  {counts.arrival}
                </span>
              </label>
            </li>
            <li>
              <label htmlFor="home-departures" className="home-tab home-tab-departure">
                {t('departures')}
                <span className="tabular text-text-muted ms-2 text-sm font-normal">
                  {counts.departure}
                </span>
              </label>
            </li>
          </ul>
        </nav>

        {/* Pin, share and destination weather. It walks `[data-flight-row]`
            across the document, which is why its pinning re-parents each row
            into its own table rather than into the first one it found. */}
        <BoardEnhancements />

        <div className="board-pane home-panel mt-4" data-direction="arrival">
          <FlightTable
            flights={forDirection('arrival')}
            locale={locale}
            kind="arrival"
            groupByDate={false}
          />
        </div>
        <div className="board-pane home-panel mt-4" data-direction="departure">
          <FlightTable
            flights={forDirection('departure')}
            locale={locale}
            kind="departure"
            groupByDate={false}
          />
        </div>
      </div>

      <Link href="/flights" className="text-brand-text-strong text-sm font-medium hover:underline">
        {t('seeFullBoard')} →
      </Link>
    </section>
  );
}
