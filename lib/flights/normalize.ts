/**
 * Cell normalisers (plan §5.4).
 *
 * Every function here is pure and takes `unknown`, because the input is a
 * human-maintained spreadsheet: a column that held a number last week may hold
 * a string this week. Nothing may throw on unexpected input — it returns a
 * result the caller can turn into a diagnostic.
 */

/** Excel's day-zero in the 1900 date system. Serial 45383 → 2024-04-01. */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

/**
 * Serials 1–60 sit inside Excel's fake 1900 leap year, where the epoch above
 * is off by one. A weekly flight schedule is never dated 1900, so rather than
 * implement the bug we reject that range outright.
 */
const MIN_SERIAL = 61;
/** 9999-12-31. */
const MAX_SERIAL = 2958465;

const MINUTES_PER_DAY = 1440;

export type TimeParse =
  | { kind: 'empty' }
  | { kind: 'time'; value: string }
  /** Rounded up to exactly 24:00; clamped to 00:00 and reported. */
  | { kind: 'clamped'; value: '00:00' }
  | { kind: 'invalid'; raw: string };

function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Normalises a scheduled-time cell to `HH:MM`.
 *
 * The sample file mixes three representations in one column: Excel day
 * fractions (`0.52083333`), text (`'13:00'`), and text with seconds
 * (`'12:30:00'`).
 *
 * The rounding is not cosmetic. `0.57986111111111105 × 1440` is
 * `834.9999999999999`; truncating yields `13:54` where the file means `13:55`.
 * Three of the twenty-four times in the sample break under truncation
 * (plan §1.1b), and an off-by-one-minute departure board is the kind of defect
 * nobody notices until a passenger misses a flight.
 */
export function normalizeTime(value: unknown): TimeParse {
  if (value === null || value === undefined) return { kind: 'empty' };

  // Defensive only: `readWorkbook` converts date-typed cells to serials before
  // they reach here. If one does arrive it was built by SheetJS, which uses
  // LOCAL components — so they must be read the same way or the time shifts by
  // the host's UTC offset.
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { kind: 'invalid', raw: 'Invalid Date' };
    return { kind: 'time', value: formatMinutes(value.getHours() * 60 + value.getMinutes()) };
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return { kind: 'invalid', raw: String(value) };

    const fraction = value % 1;
    const total = Math.round(fraction * MINUTES_PER_DAY);

    if (total === MINUTES_PER_DAY) return { kind: 'clamped', value: '00:00' };
    return { kind: 'time', value: formatMinutes(total) };
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return { kind: 'empty' };

    const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
    if (match) {
      const hours = Number(match[1]);
      const minutes = Number(match[2]);
      if (hours > 23 || minutes > 59) return { kind: 'invalid', raw: trimmed };
      return { kind: 'time', value: formatMinutes(hours * 60 + minutes) };
    }

    // A numeric string in a text-formatted cell, e.g. "0.5208333".
    const asNumber = Number(trimmed);
    if (trimmed !== '' && Number.isFinite(asNumber) && /^[\d.]+$/.test(trimmed)) {
      return normalizeTime(asNumber);
    }

    return { kind: 'invalid', raw: trimmed };
  }

  return { kind: 'invalid', raw: String(value) };
}

export type DateParse = { kind: 'date'; value: string } | { kind: 'invalid'; raw: string };

function formatUtcDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Normalises a date cell to `YYYY-MM-DD`.
 *
 * Branches on the **value type**, never on the cell's number format. In the
 * sample, weekday rows carry an `mm-dd-yy` number format while holding the
 * string `'TUESDAY'` (plan §1.1c) — any format-driven heuristic misreads them.
 *
 * All arithmetic is in UTC so the host timezone cannot shift a date.
 */
export function parseFlightDate(value: unknown): DateParse {
  if (value === null || value === undefined) return { kind: 'invalid', raw: '' };

  // Defensive only — see the note in `normalizeTime`. SheetJS builds these in
  // local time, so local components are the correct ones to read.
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { kind: 'invalid', raw: 'Invalid Date' };
    return buildDate(value.getFullYear(), value.getMonth() + 1, value.getDate(), 'Date');
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { kind: 'invalid', raw: String(value) };
    const serial = Math.floor(value);
    if (serial < MIN_SERIAL || serial > MAX_SERIAL) return { kind: 'invalid', raw: String(value) };
    return { kind: 'date', value: formatUtcDate(new Date(EXCEL_EPOCH_UTC + serial * 86_400_000)) };
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return { kind: 'invalid', raw: '' };

    // YYYY-MM-DD
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (iso) return buildDate(Number(iso[1]), Number(iso[2]), Number(iso[3]), trimmed);

    // DD.MM.YYYY / DD.MM.YY / DD/MM/YYYY — day first, as written in the file's
    // own title row ("WEEKLY PLAN 01.04.2024...").
    const dmy = /^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})$/.exec(trimmed);
    if (dmy) {
      const year = Number(dmy[3]);
      return buildDate(year < 100 ? 2000 + year : year, Number(dmy[2]), Number(dmy[1]), trimmed);
    }

    // A numeric string in a text-formatted cell.
    if (/^\d+(\.\d+)?$/.test(trimmed)) return parseFlightDate(Number(trimmed));

    return { kind: 'invalid', raw: trimmed };
  }

  return { kind: 'invalid', raw: String(value) };
}

function buildDate(year: number, month: number, day: number, raw: string): DateParse {
  if (month < 1 || month > 12 || day < 1 || day > 31) return { kind: 'invalid', raw };
  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejects impossible dates that would otherwise roll over (e.g. 31.02).
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return { kind: 'invalid', raw };
  }
  return { kind: 'date', value: formatUtcDate(date) };
}

/** Weekday name in the file's own language (English), for cross-checking. */
export function weekdayName(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }).toUpperCase();
}

export interface FlightNumber {
  /** As printed, whitespace collapsed: `KC 7163`. */
  display: string;
  /** Uppercase, whitespace removed: `KC7163`. */
  norm: string;
}

/**
 * The sample mixes `KC 7163` (with a space) and `5W7201` (without), so search
 * and identity must be whitespace-insensitive while display stays faithful to
 * the file (plan §1.1f).
 */
export function normalizeFlightNo(value: unknown): FlightNumber | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const display = String(value).trim().replace(/\s+/g, ' ');
  if (display === '') return null;
  return { display, norm: display.toUpperCase().replace(/\s+/g, '') };
}

export interface CityName {
  raw: string;
  key: string;
}

export function normalizeCity(value: unknown): CityName | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value).trim().replace(/\s+/g, ' ');
  if (raw === '') return null;
  return { raw, key: raw.toUpperCase() };
}

/**
 * `RMA`/`RMD` carry `DOM` or `INT`. Anything else returns `null` — the UI
 * renders unknown as unknown rather than guessing a flight is domestic
 * (plan §5.4).
 */
export function normalizeIntl(value: unknown): boolean | null {
  if (typeof value !== 'string') return null;
  const token = value.trim().toUpperCase();
  if (token === 'INT') return true;
  if (token === 'DOM') return false;
  return null;
}

/** Whitespace-only cells count as empty — the sample's separator rows contain them. */
export function isBlankCell(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  return String(value).trim() === '';
}

export function isBlankRow(row: readonly unknown[] | undefined): boolean {
  if (!row) return true;
  return row.every(isBlankCell);
}
