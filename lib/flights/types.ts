/**
 * The normalised flight-data contract (spec §6.3, plan §3.3).
 *
 * Nothing downstream of the parser should ever see a raw spreadsheet cell.
 */

export type FlightKind = 'arrival' | 'departure';

export interface ParsedFlightEntry {
  kind: FlightKind;
  /** `YYYY-MM-DD`, airport-local. Taken from the day block, which is authoritative. */
  date: string;
  /** As printed in the file, e.g. `KC 7163`. */
  flightNo: string;
  /** Uppercase, whitespace stripped, e.g. `KC7163`. Identity, search and dedup. */
  flightNoNorm: string;
  /** As printed, e.g. `ABU DHABI`. */
  cityRaw: string;
  /** Uppercase, whitespace collapsed. Key into the city dictionary. */
  cityKey: string;
  /**
   * `HH:MM` wall-clock string — never a timestamp. See plan §4 rule 1: the
   * moment this becomes a Date, a UTC server shifts the whole board by five
   * hours.
   */
  scheduledTime: string | null;
  /** `true` = international, `false` = domestic, `null` = unknown. Never guessed. */
  intl: boolean | null;
  aircraft: string | null;
  /** Links the arrival and departure halves of one aircraft rotation. */
  turnaroundKey: string;
  /** 1-based spreadsheet row, so diagnostics can cite the real file. */
  sourceRow: number;
}

/**
 * One flight as the board renders it.
 *
 * Declared here rather than beside the queries that produce it because the
 * overlay in `current.ts`'s neighbour `overlay.ts` has to name this shape, and
 * that module is deliberately free of `server-only` so it can be tested on its
 * own. `queries.ts` re-exports it, so nothing that imported it from there had
 * to change.
 *
 * `actualTime` and `note` never come from the workbook — they are the two
 * things only a human at the airport can say, and they arrive from
 * `flight_edits`.
 */
export interface BoardFlight {
  id: string;
  kind: FlightKind;
  date: string;
  flightNo: string;
  flightNoNorm: string;
  cityRaw: string;
  cityKey: string;
  scheduledTime: string | null;
  intl: boolean | null;
  aircraft: string | null;
  /** `HH:MM` as staff observed it, or null when nobody has said. */
  actualTime: string | null;
  /** Short free text shown beside the flight. */
  note: string | null;
  /**
   * The carrier staff have named, when it is not the one the flight number
   * implies. Null means nobody has said and the number decides — see
   * `airlineForFlight`.
   */
  airline: string | null;
}

export type DiagnosticSeverity = 'error' | 'warning';

/**
 * Diagnostic codes. Tests assert on codes, not on message text, so wording can
 * be improved without breaking the suite.
 */
export const DIAGNOSTIC = {
  // Errors — block publish (plan §5.9)
  NOT_A_WORKBOOK: 'not-a-workbook',
  NO_SHEETS: 'no-sheets',
  NO_DATE_BLOCKS: 'no-date-blocks',
  NO_ENTRIES: 'no-entries',
  UNPARSEABLE_DATE: 'unparseable-date',
  DUPLICATE_DATE_BLOCK: 'duplicate-date-block',
  MALFORMED_HEADER: 'malformed-header',
  DATE_1904: 'date-1904-workbook',

  // Warnings — allow publish
  HEADER_ASSUMED: 'header-assumed-by-position',
  WEEKDAY_MISMATCH: 'weekday-mismatch',
  UNKNOWN_CITY: 'unknown-city',
  MISSING_TIME: 'missing-time',
  INVALID_TIME: 'invalid-time',
  MIDNIGHT_CLAMPED: 'midnight-clamped',
  UNKNOWN_DOM_INT: 'unknown-dom-int',
  MULTIPLE_SHEETS: 'multiple-sheets',
  NON_CONTIGUOUS_DATES: 'non-contiguous-dates',
  MISSING_CITY: 'missing-city',
} as const;

export type DiagnosticCode = (typeof DIAGNOSTIC)[keyof typeof DIAGNOSTIC];

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: DiagnosticCode;
  message: string;
  /** 1-based spreadsheet row, when the problem is attributable to one. */
  row?: number;
  /** 1-based day-block index. */
  block?: number;
}

export interface ParsedDay {
  date: string;
  /** Weekday name as printed in the file, for cross-checking only. */
  weekday: string | null;
  arrivals: number;
  departures: number;
}

export interface ParseResult {
  /** True when there are no `error`-severity diagnostics. */
  ok: boolean;
  entries: ParsedFlightEntry[];
  days: ParsedDay[];
  diagnostics: Diagnostic[];
  weekStart: string | null;
  weekEnd: string | null;
  sheetName: string | null;
}

export function isError(d: Diagnostic): boolean {
  return d.severity === 'error';
}

export function countBySeverity(diagnostics: Diagnostic[]) {
  return {
    errors: diagnostics.filter((d) => d.severity === 'error').length,
    warnings: diagnostics.filter((d) => d.severity === 'warning').length,
  };
}
