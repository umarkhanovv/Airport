import { Fragment } from 'react';
import { getTranslations } from 'next-intl/server';

import { airlineLogo, airlineName } from '@/lib/flights/airlines';
import { cityDisplayName } from '@/lib/flights/cities';
import { searchHaystack } from '@/lib/flights/board';
import { expiresAt } from '@/lib/flights/current';
import { pinKey } from '@/lib/pinned';
import { env } from '@/lib/env';
import type { BoardFlight } from '@/lib/flights/queries';
import { formatLongDate, formatWeekday } from '@/lib/date';
import type { Locale } from '@/i18n/routing';
import type { FlightKind } from '@/lib/flights/types';

/**
 * The flight board table.
 *
 * A timetable is genuinely tabular data, so this stays a real `<table>` with
 * column headers — screen-reader users can then navigate it by row and column
 * instead of hearing an undifferentiated list of numbers.
 *
 * On phones CSS restyles the rows into cards (spec §6.4 asks for cards rather
 * than a dense enterprise grid). Because `display: block` would otherwise strip
 * the table roles, every element carries its native role explicitly, so the
 * semantics survive the restyle.
 */

function DayHeading({ date, locale }: { date: string; locale: Locale }) {
  return (
    <tr role="row" className="board-day">
      {/* Spans every column, airline included — one short of it and the day
          heading stops covering the table it is heading. */}
      <th role="columnheader" scope="colgroup" colSpan={7} className="board-day-cell">
        <span className="text-text font-semibold">{formatWeekday(date, locale)}</span>{' '}
        <span className="text-text-muted font-normal">{formatLongDate(date, locale)}</span>
      </th>
    </tr>
  );
}

export async function FlightTable({
  flights,
  locale,
  kind,
  groupByDate,
  expires = false,
}: {
  flights: BoardFlight[];
  locale: Locale;
  kind: FlightKind;
  groupByDate: boolean;
  /**
   * Whether these rows retire themselves as the day passes (`lib/flights/current.ts`).
   *
   * Off by default, and deliberately opt-in per table rather than global: the
   * week view and an explicitly chosen date are planning views. Someone who
   * picked Thursday wants all of Thursday, and a search result that vanished
   * because the flight left twenty minutes ago would look like a broken search.
   * Only the two "what is happening now" tables pass this.
   */
  expires?: boolean;
}) {
  const t = await getTranslations('Board');
  const isArrival = kind === 'arrival';
  const accent = isArrival ? 'text-arrival' : 'text-brand-text-strong';

  return (
    <table role="table" className="board w-full border-collapse text-left">
      <caption className="sr-only">
        {isArrival ? t('arrivals') : t('departures')} — {t('scheduledTimesNote')}
      </caption>

      <thead role="rowgroup">
        <tr role="row" className="border-border border-b">
          <th role="columnheader" scope="col" className="board-th">
            {t('columnTime')}
          </th>
          <th role="columnheader" scope="col" className="board-th">
            {isArrival ? t('columnOrigin') : t('columnDestination')}
          </th>
          <th role="columnheader" scope="col" className="board-th">
            {t('columnFlight')}
          </th>
          <th role="columnheader" scope="col" className="board-th">
            {t('columnAirline')}
          </th>
          <th role="columnheader" scope="col" className="board-th board-col-optional">
            {t('columnAircraft')}
          </th>
          <th role="columnheader" scope="col" className="board-th">
            {t('columnType')}
          </th>
          <th role="columnheader" scope="col" className="board-th">
            <span className="sr-only">{t('columnActions')}</span>
          </th>
        </tr>
      </thead>

      <tbody role="rowgroup">
        {flights.map((flight, index) => {
          // Derived from position rather than a variable mutated while
          // rendering, so the row markup stays a pure function of the data.
          const showDay = groupByDate && flight.date !== flights[index - 1]?.date;

          const city = cityDisplayName(flight.cityKey, locale, flight.cityRaw);
          const carrier = airlineName(flight);
          const logo = airlineLogo(flight);
          /*
           * A real instant, not a wall-clock string, so the browser can retire
           * the row with one comparison against `Date.now()` — correct whether
           * the reader is in Türkistan, in Istanbul, or on a laptop whose
           * timezone is wrong. `null` for a flight with no published time, and
           * an absent attribute is what tells the client to leave it alone.
           */
          const retiresAt = expires ? expiresAt(flight.date, flight, env.airportTz) : null;

          const haystack = searchHaystack({
            flightNo: flight.flightNo,
            flightNoNorm: flight.flightNoNorm,
            cityRaw: flight.cityRaw,
            cityNames: [city],
          });

          return (
            <Fragment key={flight.id}>
              {showDay && <DayHeading date={flight.date} locale={locale} />}
              <tr
                role="row"
                className="board-row border-border border-b"
                data-search={haystack}
                data-flight-row=""
                data-expires-at={retiresAt ?? undefined}
                data-pin-key={pinKey({
                  date: flight.date,
                  kind: flight.kind,
                  flightNoNorm: flight.flightNoNorm,
                  scheduledTime: flight.scheduledTime,
                })}
                data-city-key={flight.cityKey}
                data-date-label={formatLongDate(flight.date, locale)}
              >
                <td
                  role="cell"
                  className="board-td board-time"
                  data-date-label={formatLongDate(flight.date, locale)}
                >
                  <span className={`tabular text-xl font-semibold sm:text-2xl ${accent}`}>
                    {flight.scheduledTime ?? '—'}
                  </span>
                  {/*
                    When it actually went, if anybody has said.

                    A real element rather than another `::after` on this cell —
                    the pinned-row date label already occupies that pseudo.

                    The wording states the fact and claims nothing else. The
                    board has no live feed and says so on every table; "вылетел"
                    would be a status, and a status nobody typed today is a
                    status that is wrong. `board.spec.ts` fails the build if
                    that vocabulary appears here.
                  */}
                  {flight.actualTime ? (
                    <span className="board-actual tabular">
                      {t('actualAt', { time: flight.actualTime })}
                    </span>
                  ) : null}
                </td>
                <td role="cell" className="board-td board-city">
                  <span className="text-text font-medium">{city}</span>
                  {/* Whatever staff wrote about this flight, verbatim. Rendered
                      as text like every other value on this page, so a note
                      typed with a bracket in it is a note and not markup. */}
                  {flight.note ? <span className="board-note">{flight.note}</span> : null}
                </td>
                <td role="cell" className="board-td board-flight">
                  <span className="tabular text-text-muted">{flight.flightNo}</span>
                </td>

                {/*
                  Who is flying it, which the workbook never says in words —
                  only in the two characters at the front of the number.

                  Its own column, so the marks line up down the board and can be
                  scanned as a column rather than hunted for under each flight
                  number. The mark stands in for the name rather than beside it:
                  every carrier here has a wordmark, two to four times wider
                  than tall, so the logo already reads "Air Astana" and setting
                  it again underneath is the same sentence twice.
                */}
                <td role="cell" className="board-td board-airline">
                  {logo ? (
                    <span className="board-airline-mark">
                      {/* Same call as `components/news-cover.tsx`: a 4 KB mark
                          served straight from `public/` gains nothing from the
                          optimiser and would cost a second hop on a self-hosted
                          single node. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={logo.src}
                        // Real dimensions, computed from the mark's own aspect
                        // ratio. Without them the browser has nothing to size
                        // by until the stylesheet arrives, and an unstyled
                        // wordmark draws at its natural several-hundred pixels
                        // across — which is exactly what a stale stylesheet
                        // produced on the board.
                        width={logo.width}
                        height={logo.height}
                        // The carrier's name, so a screen reader says
                        // "KC 7361 Air Astana" rather than skipping it.
                        alt={logo.alt}
                        loading="lazy"
                        decoding="async"
                      />
                    </span>
                  ) : carrier ? (
                    <span className="board-airline-name">{carrier}</span>
                  ) : null}
                </td>
                <td role="cell" className="board-td board-col-optional">
                  <span className="text-text-muted">{flight.aircraft ?? '—'}</span>
                </td>
                <td role="cell" className="board-td board-type">
                  {flight.intl === null ? (
                    <span className="text-text-muted text-sm">—</span>
                  ) : (
                    <span
                      className={`border-border-strong text-text-muted inline-block rounded border px-1.5 py-0.5 text-xs font-medium ${
                        flight.intl ? 'board-badge-int' : 'board-badge-dom'
                      }`}
                    >
                      {flight.intl ? t('international') : t('domestic')}
                    </span>
                  )}
                </td>
                <td role="cell" className="board-td board-actions">
                  <div className="flex items-center gap-1">
                    {/*
                      Pin and share need scripting, so they are hidden until the
                      inline head script marks the document. The calendar link
                      is a plain anchor and works regardless.
                    */}
                    <button
                      type="button"
                      data-js-only=""
                      data-pin-toggle={pinKey({
                        date: flight.date,
                        kind: flight.kind,
                        flightNoNorm: flight.flightNoNorm,
                        scheduledTime: flight.scheduledTime,
                      })}
                      aria-pressed="false"
                      title={t('pin')}
                      className="board-icon-button"
                    >
                      <span className="sr-only">{t('pinFlight', { flight: flight.flightNo })}</span>
                      <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4">
                        <path
                          d="M9.5 1.5 14 6l-2 .5-3 3-.5 3.5-2-2L3 14l3-3.5-2-2L7.5 8l3-3L9.5 1.5Z"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>

                    {flight.scheduledTime && (
                      <a
                        href={`/api/flights/${flight.id}/ics?locale=${locale}`}
                        title={t('addToCalendar')}
                        className="board-icon-button"
                        download
                      >
                        <span className="sr-only">
                          {t('addToCalendarFor', { flight: flight.flightNo })}
                        </span>
                        <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4">
                          <rect
                            x="2"
                            y="3"
                            width="12"
                            height="11"
                            rx="1.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.4"
                          />
                          <path
                            d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                          />
                        </svg>
                      </a>
                    )}

                    <button
                      type="button"
                      data-js-only=""
                      data-share={`${city} · ${flight.flightNo} · ${flight.scheduledTime ?? ''}`}
                      title={t('share')}
                      className="board-icon-button"
                    >
                      <span className="sr-only">
                        {t('shareFlight', { flight: flight.flightNo })}
                      </span>
                      <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4">
                        <path
                          d="M11 5.5a2 2 0 1 0-1.9-2.6L6 4.6a2 2 0 1 0 0 2.8l3.1 1.7a2 2 0 1 0 .6-1.2L6.6 6.2a2 2 0 0 0 0-.4l3.1-1.7c.35.55.95.9 1.3.9Z"
                          fill="currentColor"
                        />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
