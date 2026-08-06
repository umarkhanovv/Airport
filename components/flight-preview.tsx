import { getTranslations } from 'next-intl/server';

import { cityDisplayName } from '@/lib/flights/cities';
import { getActiveSchedule, getFlightsForDate, type BoardFlight } from '@/lib/flights/queries';
import { airportNowTime, airportToday, formatLongDate } from '@/lib/date';
import { env } from '@/lib/env';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';

/**
 * Today's flights, on the home page.
 *
 * Spec §11 asks the home page to open with the board rather than a wall of
 * menu, so this is the first thing below the masthead. It is a summary, not
 * the board — Stage 3 builds the full arrivals/departures interface.
 *
 * The time is the largest element on the page. On a site whose entire job is
 * telling someone when their flight is, the digits are the content; everything
 * else is annotation.
 */

function DirectionColumn({
  flights,
  locale,
  heading,
  emptyLabel,
  accent,
}: {
  flights: BoardFlight[];
  locale: Locale;
  heading: string;
  emptyLabel: string;
  accent: 'departure' | 'arrival';
}) {
  // Colour never carries the meaning alone: each column is also headed, and
  // the arrow glyph differs (spec §5 — the legacy site had these swapped).
  const accentText = accent === 'arrival' ? 'text-arrival' : 'text-brand-text-strong';
  const accentRule = accent === 'arrival' ? 'bg-arrival' : 'bg-brand';

  return (
    <section aria-label={heading}>
      <h3 className="flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
        <span aria-hidden="true" className={`h-3 w-1 rounded-full ${accentRule}`} />
        <span className={accentText}>{heading}</span>
      </h3>

      {flights.length === 0 ? (
        <p className="text-text-muted mt-4 text-sm">{emptyLabel}</p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--border)]">
          {flights.map((flight) => (
            <li key={flight.id} className="flex items-baseline gap-4 py-3">
              <span
                className={`tabular text-2xl leading-none font-semibold sm:text-3xl ${accentText}`}
              >
                {flight.scheduledTime ?? '—'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-text block truncate font-medium">
                  {cityDisplayName(flight.cityKey, locale, flight.cityRaw)}
                </span>
                <span className="tabular text-text-muted block text-sm">
                  {flight.flightNo}
                  {flight.aircraft ? ` · ${flight.aircraft}` : ''}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export async function FlightPreview({ locale }: { locale: Locale }) {
  const t = await getTranslations('Board');
  const schedule = getActiveSchedule();
  const today = airportToday(env.airportTz);

  // No schedule published yet — say so plainly rather than showing an
  // ambiguous empty table (spec §6.4: honesty over appearance).
  if (!schedule) {
    return (
      <div className="border-border bg-surface-raised rounded-xl border p-6">
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
   */
  const covers =
    schedule.weekStart &&
    schedule.weekEnd &&
    today >= schedule.weekStart &&
    today <= schedule.weekEnd;

  if (!covers) {
    return (
      <div className="border-border bg-surface-raised rounded-xl border p-6">
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

  const all = getFlightsForDate(today);
  const now = airportNowTime(env.airportTz);

  // Show what is still to come; if the day is over, show the whole day rather
  // than an empty panel.
  const upcoming = all.filter((f) => (f.scheduledTime ?? '') >= now);
  const shown = upcoming.length > 0 ? upcoming : all;

  const arrivals = shown.filter((f) => f.kind === 'arrival').slice(0, 4);
  const departures = shown.filter((f) => f.kind === 'departure').slice(0, 4);

  return (
    <div className="border-border bg-surface-raised rounded-xl border">
      <div className="border-border flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b px-5 py-4 sm:px-6">
        <h2 className="text-text text-lg font-semibold">{t('today')}</h2>
        <p className="text-text-muted text-sm">
          {formatLongDate(today, locale)}
          {' · '}
          {/* Times are scheduled, never live. Saying so once, here, is the
              honest framing the whole board depends on (spec §6.4). */}
          <span>{t('scheduledTimesNote')}</span>
        </p>
      </div>

      <div className="grid gap-8 px-5 py-5 sm:grid-cols-2 sm:px-6">
        <DirectionColumn
          flights={arrivals}
          locale={locale}
          heading={t('arrivals')}
          emptyLabel={t('noArrivalsToday')}
          accent="arrival"
        />
        <DirectionColumn
          flights={departures}
          locale={locale}
          heading={t('departures')}
          emptyLabel={t('noDeparturesToday')}
          accent="departure"
        />
      </div>

      <div className="border-border border-t px-5 py-3 sm:px-6">
        <Link
          href="/flights"
          className="text-brand-text-strong text-sm font-medium hover:underline"
        >
          {t('seeFullBoard')} →
        </Link>
      </div>
    </div>
  );
}
