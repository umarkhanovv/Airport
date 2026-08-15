import { getTranslations } from 'next-intl/server';

import { FlightTable } from '@/components/board/flight-table';
import { Link } from '@/i18n/navigation';
import { formatLongDate } from '@/lib/date';
import { kindParam } from '@/lib/flights/board';
import type { BoardFlight } from '@/lib/flights/queries';
import type { FlightKind } from '@/lib/flights/types';
import type { Locale } from '@/i18n/routing';

/**
 * A board of today's flights, which empties as the day goes on.
 *
 * The rule itself lives in `lib/flights/current.ts`; this is the shape it needs
 * around it. Two things have to be true at once:
 *
 *   - the rows still to come are rendered on the server, so the board is right
 *     for a reader with no JavaScript and for the first paint;
 *   - the "nothing left today" notice is *always* in the HTML, hidden, because
 *     the browser may retire the last remaining row minutes after the page was
 *     served. Rendering the notice only when the server already knows the board
 *     is empty would leave a table with no rows in it and no explanation.
 *
 * So the server decides the initial state by setting `data-board-exhausted`,
 * and `board-enhancements.tsx` moves it later. The CSS that acts on it is in
 * `globals.css` under "the board empties as the day passes".
 */
export async function LiveBoard({
  flights,
  locale,
  kind,
  nextDate,
  className = '',
  direction,
}: {
  /** Already filtered by `stillToCome` — this component does not re-filter. */
  flights: BoardFlight[];
  locale: Locale;
  kind: FlightKind;
  /**
   * The next day the published schedule actually covers, or `null` when today
   * is the last of it. Named as a date rather than "tomorrow" because the
   * workbook is free to skip a day, and a link that promised tomorrow and
   * delivered an empty board would be worse than no link.
   */
  nextDate: string | null;
  className?: string;
  /** Drives the home page's CSS-only direction tabs. */
  direction?: FlightKind;
}) {
  const t = await getTranslations('Board');
  const exhausted = flights.length === 0;

  return (
    <div
      className={`board-pane ${className}`.trim()}
      data-live-board=""
      data-direction={direction}
      data-board-exhausted={exhausted ? '' : undefined}
    >
      <FlightTable flights={flights} locale={locale} kind={kind} groupByDate={false} expires />

      <p data-board-empty="" className="text-text-muted p-6 text-sm">
        {kind === 'arrival' ? t('noArrivalsToday') : t('noDeparturesToday')}
        {nextDate ? (
          <>
            {' '}
            <Link
              href={`/flights?date=${nextDate}&kind=${kindParam(kind)}`}
              className="text-brand-text-strong font-medium hover:underline"
            >
              {t('nextFlightDay', { date: formatLongDate(nextDate, locale) })} →
            </Link>
          </>
        ) : null}
      </p>
    </div>
  );
}
