/**
 * Date helpers (plan §4 rule 2).
 *
 * "Today" must be the airport's today, not the server's. If the server runs in
 * UTC — which the airport's will — its date rolls over at 19:00 Almaty time,
 * and the board would show tomorrow's flights all evening.
 *
 * `new Date().toISOString().slice(0, 10)` is banned here. Always go through
 * these functions.
 */

/** IANA zone for Türkistan. Overridable via AIRPORT_TZ. */
export const DEFAULT_AIRPORT_TZ = 'Asia/Almaty';

/** Current date at the airport, as `YYYY-MM-DD`. */
export function airportToday(
  timeZone: string = DEFAULT_AIRPORT_TZ,
  now: Date = new Date()
): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the shape we store.
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
}

/** Current wall-clock time at the airport, as `HH:MM`. */
export function airportNowTime(
  timeZone: string = DEFAULT_AIRPORT_TZ,
  now: Date = new Date()
): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
}

/**
 * The offset, in milliseconds, that `timeZone` was at a given instant.
 *
 * Derived from `Intl` rather than a hardcoded number: Kazakhstan moved to a
 * single UTC+5 zone in 2024, and baking that in would quietly break if the
 * rules change again or if AIRPORT_TZ is pointed somewhere else.
 */
function zoneOffsetMs(instantMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instantMs));

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  // `hour` can come back as 24 for midnight under hour12:false.
  const asIfUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second')
  );

  return asIfUtc - instantMs;
}

/**
 * Turns a wall-clock date and time in a zone into a real instant.
 *
 * The board deliberately stores `HH:MM` strings with no timezone (plan §4
 * rule 1) — but a calendar file has to name an actual moment, so the
 * conversion happens here, once, at the edge.
 *
 * Two passes: the first guesses the offset, the second confirms it, which is
 * what makes this correct across a DST boundary rather than only in a
 * fixed-offset zone.
 */
export function zonedWallClockToUtc(
  isoDate: string,
  hhmm: string,
  timeZone: string = DEFAULT_AIRPORT_TZ
): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  const [hour, minute] = hhmm.split(':').map(Number);

  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const firstGuess = naive - zoneOffsetMs(naive, timeZone);
  const corrected = naive - zoneOffsetMs(firstGuess, timeZone);

  return new Date(corrected);
}

/**
 * A stored instant, read as a clock on the wall at the airport.
 *
 * The board never needed this: flight times are wall-clock strings by design
 * (plan §4 rule 1) and are printed exactly as the workbook gave them. But the
 * admin panel records real instants — when a schedule was published, when a
 * message arrived — and it printed them with `toISOString()` and the word
 * "UTC" after. A staff member uploading at 21:12 in Türkistan was told they
 * had done it at 16:12, which is not a formatting quibble on a page whose job
 * is to say what is live right now.
 *
 * The offset is read out of `Intl` rather than written down. Kazakhstan
 * collapsed to a single UTC+5 zone in 2024 and a "+5" in the source would
 * quietly become a lie the next time the rules move, or the moment AIRPORT_TZ
 * points somewhere else.
 */
export function formatAirportDateTime(iso: string, timeZone: string = DEFAULT_AIRPORT_TZ): string {
  // SQLite hands back `YYYY-MM-DD HH:MM:SS` in some paths and a full ISO
  // string in others; both mean UTC here.
  const parsed = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  if (Number.isNaN(parsed.getTime())) return iso;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'shortOffset',
  }).formatToParts(parsed);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  // `hour` can come back as 24 for midnight under hour12:false.
  const hour = String(Number(get('hour')) % 24).padStart(2, '0');
  // "GMT+5" is what `shortOffset` produces, and "UTC+5" is what the people
  // reading this page call it.
  const offset = get('timeZoneName').replace('GMT', 'UTC');

  return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')} ${offset}`;
}

/** Shifts a `YYYY-MM-DD` string by whole days without touching timezones. */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return shifted.toISOString().slice(0, 10);
}

/** Localised long date, e.g. "6 апреля 2024" / "6 April 2024". */
export function formatLongDate(isoDate: string, locale: string): string {
  const bcp47 = locale === 'kk' ? 'kk-KZ' : locale === 'ru' ? 'ru-RU' : 'en-GB';
  return new Intl.DateTimeFormat(bcp47, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

/** Localised weekday, e.g. "суббота" / "Saturday". */
export function formatWeekday(isoDate: string, locale: string): string {
  const bcp47 = locale === 'kk' ? 'kk-KZ' : locale === 'ru' ? 'ru-RU' : 'en-GB';
  return new Intl.DateTimeFormat(bcp47, { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(`${isoDate}T00:00:00Z`)
  );
}
