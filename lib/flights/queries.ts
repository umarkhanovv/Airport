import 'server-only';

import { and, asc, eq, gte, lte } from 'drizzle-orm';

import { getDb } from '../db/index.ts';
import { flightEdits, flightEntries, scheduleUploads } from '../db/schema.ts';
import { ADDED_ID_PREFIX, applyEdits, type FlightEdit } from './overlay.ts';
import type { BoardFlight, FlightKind } from './types.ts';

/**
 * Read-side queries for the published schedule.
 *
 * Everything here reads the single active upload. If no schedule has been
 * published yet — a fresh install, or the very first day — these return empty
 * results rather than throwing, so the site renders a truthful empty state
 * instead of an error page.
 */

export interface ActiveSchedule {
  uploadId: string;
  weekStart: string | null;
  weekEnd: string | null;
  uploadedAt: string;
  originalFilename: string;
  storedPath: string;
  entryCount: number;
}

export function getActiveSchedule(): ActiveSchedule | null {
  const rows = getDb()
    .select()
    .from(scheduleUploads)
    .where(eq(scheduleUploads.isActive, true))
    .limit(1)
    .all();

  const row = rows[0];
  if (!row) return null;

  return {
    uploadId: row.id,
    weekStart: row.weekStart,
    weekEnd: row.weekEnd,
    uploadedAt: row.uploadedAt,
    originalFilename: row.originalFilename,
    storedPath: row.storedPath,
    entryCount: row.entryCount,
  };
}

/** Re-exported from `types.ts`, where the overlay can name it too. */
export type { BoardFlight };

/**
 * The columns every board query selects.
 *
 * `actualTime` and `note` are not among them — no workbook supplies either, so
 * they arrive as constants here and are filled in by the overlay. Naming them
 * once keeps the four readers below honest about returning the same shape.
 */
const BOARD_COLUMNS = {
  id: flightEntries.id,
  kind: flightEntries.kind,
  date: flightEntries.date,
  flightNo: flightEntries.flightNo,
  flightNoNorm: flightEntries.flightNoNorm,
  cityRaw: flightEntries.cityRaw,
  cityKey: flightEntries.cityKey,
  scheduledTime: flightEntries.scheduledTime,
  intl: flightEntries.intl,
  aircraft: flightEntries.aircraft,
} as const;

/** The workbook's own columns, before anyone has corrected them. */
function asBoardFlight(row: {
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
}): BoardFlight {
  return { ...row, actualTime: null, note: null, airline: null };
}

/**
 * Staff corrections covering a date range.
 *
 * Read unconditionally rather than only when the board looks empty: an edit is
 * a fact about a flight, and there is no cheaper way to know whether one exists
 * than to ask. A week of them is a few dozen rows on an indexed column.
 */
function editsBetween(from: string, to: string): FlightEdit[] {
  return getDb()
    .select({
      id: flightEdits.id,
      date: flightEdits.date,
      kind: flightEdits.kind,
      flightNoNorm: flightEdits.flightNoNorm,
      isAdded: flightEdits.isAdded,
      isRemoved: flightEdits.isRemoved,
      flightNo: flightEdits.flightNo,
      cityRaw: flightEdits.cityRaw,
      cityKey: flightEdits.cityKey,
      scheduledTime: flightEdits.scheduledTime,
      intl: flightEdits.intl,
      aircraft: flightEdits.aircraft,
      actualTime: flightEdits.actualTime,
      note: flightEdits.note,
      airline: flightEdits.airline,
    })
    .from(flightEdits)
    .where(and(gte(flightEdits.date, from), lte(flightEdits.date, to)))
    .all();
}

/** Every edit for one day, for the admin screen that shows what was changed. */
export function listFlightEdits(date: string): FlightEdit[] {
  return editsBetween(date, date);
}

/**
 * The workbook's own rows for a day, before any correction.
 *
 * Only the editing screen wants these. Everywhere else the merged view is the
 * truth, but an editor has to show both layers at once — which field the file
 * said, which field a human overruled, and whether a flight is on the board at
 * all. `getFlightsForDate` cannot answer the last one: a tombstoned flight is
 * absent from it by design.
 */
export function getWorkbookFlightsForDate(date: string): BoardFlight[] {
  const active = getActiveSchedule();
  if (!active) return [];

  return getDb()
    .select(BOARD_COLUMNS)
    .from(flightEntries)
    .where(and(eq(flightEntries.uploadId, active.uploadId), eq(flightEntries.date, date)))
    .orderBy(asc(flightEntries.kind), asc(flightEntries.scheduledTime))
    .all()
    .map(asBoardFlight);
}

/** One edit row, for resolving the id of a flight staff added. */
function editsById(editId: string): FlightEdit | null {
  return (
    getDb()
      .select({
        id: flightEdits.id,
        date: flightEdits.date,
        kind: flightEdits.kind,
        flightNoNorm: flightEdits.flightNoNorm,
        isAdded: flightEdits.isAdded,
        isRemoved: flightEdits.isRemoved,
        flightNo: flightEdits.flightNo,
        cityRaw: flightEdits.cityRaw,
        cityKey: flightEdits.cityKey,
        scheduledTime: flightEdits.scheduledTime,
        intl: flightEdits.intl,
        aircraft: flightEdits.aircraft,
        actualTime: flightEdits.actualTime,
        note: flightEdits.note,
        airline: flightEdits.airline,
      })
      .from(flightEdits)
      .where(eq(flightEdits.id, editId))
      .limit(1)
      .all()[0] ?? null
  );
}

/**
 * Flights for one day and direction, in chronological order.
 *
 * Ordering by the `HH:MM` text works because the values are zero-padded, so
 * lexical order is chronological order — and a post-midnight 00:20 arrival
 * correctly sorts to the top of its day (plan decision #5).
 */
export function getFlightsForDate(date: string, kind?: FlightKind): BoardFlight[] {
  const active = getActiveSchedule();
  if (!active) return [];

  const where = kind
    ? and(
        eq(flightEntries.uploadId, active.uploadId),
        eq(flightEntries.date, date),
        eq(flightEntries.kind, kind)
      )
    : and(eq(flightEntries.uploadId, active.uploadId), eq(flightEntries.date, date));

  const rows = getDb()
    .select(BOARD_COLUMNS)
    .from(flightEntries)
    .where(where)
    .orderBy(asc(flightEntries.scheduledTime))
    .all()
    .map(asBoardFlight);

  // Direction is part of a flight's identity and cannot be edited, so narrowing
  // the edits by it here is safe — and stops an added arrival being appended to
  // a query for departures.
  const edits = editsBetween(date, date).filter((edit) => !kind || edit.kind === kind);

  return applyEdits(rows, edits);
}

export interface BoardQuery {
  kind: FlightKind;
  /** Inclusive date range. A single day passes the same value twice. */
  from: string;
  to: string;
  /** `null` means both domestic and international. */
  intl?: boolean | null;
}

/**
 * Flights for the board, ordered by date then time.
 *
 * The DOM/INT filter deliberately does not match rows where `intl` is NULL:
 * unknown is not the same as domestic, and quietly folding unknowns into one
 * bucket would misrepresent the data (plan §5.4).
 */
export function getBoardFlights(query: BoardQuery): BoardFlight[] {
  const active = getActiveSchedule();
  if (!active) return [];

  const rows = getDb()
    .select(BOARD_COLUMNS)
    .from(flightEntries)
    .where(
      and(
        eq(flightEntries.uploadId, active.uploadId),
        eq(flightEntries.kind, query.kind),
        gte(flightEntries.date, query.from),
        lte(flightEntries.date, query.to)
      )
    )
    .orderBy(asc(flightEntries.date), asc(flightEntries.scheduledTime))
    .all()
    .map(asBoardFlight);

  const edits = editsBetween(query.from, query.to).filter((edit) => edit.kind === query.kind);
  const merged = applyEdits(rows, edits);

  /*
   * The DOM/INT filter runs after the merge, not in the WHERE clause it used to
   * live in.
   *
   * A flight staff have corrected from domestic to international has to move
   * between the two filters with the correction. Filtering in SQL asks the
   * question of the workbook's value and then applies the edit to whatever
   * survived — so a mislabelled flight stayed mislabelled in exactly the view a
   * passenger would use to find it.
   */
  if (query.intl === true || query.intl === false) {
    return merged.filter((flight) => flight.intl === query.intl);
  }

  return merged;
}

/** How many flights exist per direction in a range — used for the tab counts. */
export function getDirectionCounts(
  from: string,
  to: string
): { arrival: number; departure: number } {
  /*
   * A `COUNT(*)` grouped by direction used to answer this, and cannot any more:
   * a removed flight still has a row, and an added one has none. The number in
   * a tab has to be the number of rows in the table under it, so this counts
   * what the board will actually render.
   *
   * Two merges rather than one grouped query, for a day or a week of a dozen
   * flights each. That is a rounding error against being right.
   */
  return {
    arrival: getBoardFlights({ kind: 'arrival', from, to }).length,
    departure: getBoardFlights({ kind: 'departure', from, to }).length,
  };
}

/**
 * One flight by id, for the calendar export.
 *
 * Two kinds of id arrive here. A plain uuid is a workbook row, and it still has
 * to go through the overlay — a `.ics` naming the uncorrected time would send
 * somebody to the airport on the strength of a value the board itself no longer
 * shows. An `edit:`-prefixed id is a flight staff added, which has no workbook
 * row at all.
 *
 * Either can come back null: a tombstoned flight is not a flight, and its
 * calendar link correctly 404s.
 */
export function getFlightById(id: string): BoardFlight | null {
  if (id.startsWith(ADDED_ID_PREFIX)) {
    const added = editsById(id.slice(ADDED_ID_PREFIX.length));
    if (!added || !added.isAdded || added.isRemoved) return null;
    return applyEdits([], [added])[0] ?? null;
  }

  const rows = getDb()
    .select(BOARD_COLUMNS)
    .from(flightEntries)
    .where(eq(flightEntries.id, id))
    .limit(1)
    .all();

  const row = rows[0];
  if (!row) return null;

  const edits = editsBetween(row.date, row.date).filter((edit) => edit.kind === row.kind);
  return applyEdits([asBoardFlight(row)], edits).find((flight) => flight.id === id) ?? null;
}

/** Every date the active schedule covers, ascending. */
export function getScheduleDates(): string[] {
  const active = getActiveSchedule();
  if (!active) return [];

  const rows = getDb()
    .selectDistinct({ date: flightEntries.date })
    .from(flightEntries)
    .where(eq(flightEntries.uploadId, active.uploadId))
    .orderBy(asc(flightEntries.date))
    .all();

  return rows.map((r) => r.date);
}
