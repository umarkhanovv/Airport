import 'server-only';

import { and, asc, count, eq, gte, lte } from 'drizzle-orm';

import { getDb } from '../db/index.ts';
import { flightEntries, scheduleUploads } from '../db/schema.ts';
import type { FlightKind } from './types.ts';

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

  return getDb()
    .select({
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
    })
    .from(flightEntries)
    .where(where)
    .orderBy(asc(flightEntries.scheduledTime))
    .all();
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

  const conditions = [
    eq(flightEntries.uploadId, active.uploadId),
    eq(flightEntries.kind, query.kind),
    gte(flightEntries.date, query.from),
    lte(flightEntries.date, query.to),
  ];

  if (query.intl === true || query.intl === false) {
    conditions.push(eq(flightEntries.intl, query.intl));
  }

  return getDb()
    .select({
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
    })
    .from(flightEntries)
    .where(and(...conditions))
    .orderBy(asc(flightEntries.date), asc(flightEntries.scheduledTime))
    .all();
}

/** How many flights exist per direction in a range — used for the tab counts. */
export function getDirectionCounts(
  from: string,
  to: string
): { arrival: number; departure: number } {
  const active = getActiveSchedule();
  if (!active) return { arrival: 0, departure: 0 };

  const rows = getDb()
    .select({ kind: flightEntries.kind, count: count() })
    .from(flightEntries)
    .where(
      and(
        eq(flightEntries.uploadId, active.uploadId),
        gte(flightEntries.date, from),
        lte(flightEntries.date, to)
      )
    )
    .groupBy(flightEntries.kind)
    .all();

  return {
    arrival: rows.find((r) => r.kind === 'arrival')?.count ?? 0,
    departure: rows.find((r) => r.kind === 'departure')?.count ?? 0,
  };
}

/** One flight by id, for the calendar export. */
export function getFlightById(id: string): BoardFlight | null {
  const rows = getDb()
    .select({
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
    })
    .from(flightEntries)
    .where(eq(flightEntries.id, id))
    .limit(1)
    .all();

  return rows[0] ?? null;
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
