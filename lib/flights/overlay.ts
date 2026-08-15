import type { BoardFlight, FlightKind } from './types.ts';

/**
 * Laying what staff changed over what the workbook said.
 *
 * `lib/db/schema.ts` explains why the two are kept apart at all: flight rows
 * belong to an upload and die with it, so anything a human typed has to live
 * somewhere a re-publish cannot reach. This is the other half — the one place
 * in the codebase that knows how to put them back together.
 *
 * Pure, and free of `server-only` on purpose. Every board query routes through
 * it, so it is worth being able to test the merge on plain objects rather than
 * only through a database.
 */

/** The fields of a `flight_edits` row this merge cares about. */
export interface FlightEdit {
  id: string;
  date: string;
  kind: FlightKind;
  flightNoNorm: string;
  isAdded: boolean;
  isRemoved: boolean;
  flightNo: string | null;
  cityRaw: string | null;
  cityKey: string | null;
  scheduledTime: string | null;
  intl: boolean | null;
  aircraft: string | null;
  actualTime: string | null;
  note: string | null;
}

/**
 * A flight's identity for one day: which day, which direction, which number.
 *
 * Not the scheduled time, deliberately. Editing a departure from 17:40 to 18:10
 * must find the same flight afterwards, and a key containing the time would
 * lose it — the edit would detach and the board would show both.
 */
function identity(parts: { date: string; kind: FlightKind; flightNoNorm: string }): string {
  return `${parts.date}|${parts.kind}|${parts.flightNoNorm}`;
}

/** An override column that is NULL means "no opinion", not "clear this". */
function merge(row: BoardFlight, edit: FlightEdit): BoardFlight {
  return {
    ...row,
    flightNo: edit.flightNo ?? row.flightNo,
    cityRaw: edit.cityRaw ?? row.cityRaw,
    cityKey: edit.cityKey ?? row.cityKey,
    scheduledTime: edit.scheduledTime ?? row.scheduledTime,
    intl: edit.intl ?? row.intl,
    aircraft: edit.aircraft ?? row.aircraft,
    // These two exist nowhere else, so the edit is the only source.
    actualTime: edit.actualTime,
    note: edit.note,
  };
}

/**
 * Marks an id as belonging to a flight staff added rather than to a workbook
 * row. Anything that later looks a flight up by id — the calendar export — has
 * to know which of the two tables to read.
 */
export const ADDED_ID_PREFIX = 'edit:';

/** A flight that exists only because somebody added it. */
function fromEdit(edit: FlightEdit): BoardFlight {
  return {
    id: `${ADDED_ID_PREFIX}${edit.id}`,
    kind: edit.kind,
    date: edit.date,
    flightNo: edit.flightNo ?? edit.flightNoNorm,
    flightNoNorm: edit.flightNoNorm,
    cityRaw: edit.cityRaw ?? '',
    cityKey: edit.cityKey ?? '',
    scheduledTime: edit.scheduledTime,
    intl: edit.intl,
    aircraft: edit.aircraft,
    actualTime: edit.actualTime,
    note: edit.note,
  };
}

/**
 * Ordering, matching what the SQL did before the overlay existed:
 * `ORDER BY date, scheduled_time`, and SQLite sorts NULL first ascending. A
 * flight with no published time therefore stays at the top of its day rather
 * than being quietly moved to the bottom by a JavaScript comparator that treats
 * null as a large string.
 */
function byDateThenTime(a: BoardFlight, b: BoardFlight): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.scheduledTime === b.scheduledTime) return 0;
  if (a.scheduledTime === null) return -1;
  if (b.scheduledTime === null) return 1;
  return a.scheduledTime < b.scheduledTime ? -1 : 1;
}

/**
 * The workbook's flights, as staff have since corrected them.
 *
 * Rows keep their order relative to one another where the sort cannot separate
 * them, because `Array.prototype.sort` is stable — so an added flight sharing a
 * minute with a workbook flight lands after it rather than in a coin-toss
 * position that changes between renders.
 */
export function applyEdits(rows: BoardFlight[], edits: FlightEdit[]): BoardFlight[] {
  if (edits.length === 0) return rows;

  const byIdentity = new Map(edits.map((edit) => [identity(edit), edit]));
  const claimed = new Set<string>();
  const out: BoardFlight[] = [];

  for (const row of rows) {
    const key = identity(row);
    const edit = byIdentity.get(key);
    if (!edit) {
      out.push(row);
      continue;
    }

    claimed.add(key);
    if (edit.isRemoved) continue;
    out.push(merge(row, edit));
  }

  for (const edit of edits) {
    if (!edit.isAdded || edit.isRemoved) continue;
    /*
     * An addition whose flight has since turned up in a workbook is not an
     * addition any more — it was applied above as an override. Emitting it
     * again would put the same flight on the board twice, which is how staff
     * adding a flight in week one ends up with a duplicate in week two when the
     * airport finally puts it in the file.
     */
    if (claimed.has(identity(edit))) continue;
    out.push(fromEdit(edit));
  }

  return out.sort(byDateThenTime);
}
