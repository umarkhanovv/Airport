import 'server-only';

import crypto from 'node:crypto';

import { and, eq, sql } from 'drizzle-orm';

import { getDb } from '../db/index.ts';
import { flightEdits, flightEntries, scheduleUploads } from '../db/schema.ts';

import { normalizeCity, normalizeFlightNo, normalizeTime } from './normalize.ts';
import type { FlightKind } from './types.ts';

/**
 * Writing what staff changed.
 *
 * The read side is `overlay.ts`; this is the only thing in the codebase that
 * writes `flight_edits`. Everything here goes through the same normalisers the
 * workbook parser uses — `normalizeTime`, `normalizeCity`, `normalizeFlightNo`
 * — so a time typed into the panel and a time read out of a spreadsheet end up
 * as the same string. Two paths producing two shapes for one value is how a
 * board starts sorting `9:05` after `17:40`.
 */

/** Which flight a patch is about. Never changes once written. */
export interface EditTarget {
  date: string;
  kind: FlightKind;
  /** The workbook's number, normalised. */
  flightNoNorm: string;
}

/**
 * What staff typed, before validation.
 *
 * Every field is optional and `undefined` means "this form did not offer it".
 * An empty string means "staff cleared this box", which is a real instruction
 * and becomes NULL — the column then falls back to the workbook, which is the
 * only sensible reading of clearing a correction.
 */
export interface EditInput {
  flightNo?: string;
  city?: string;
  scheduledTime?: string;
  actualTime?: string;
  aircraft?: string;
  /** `'dom'`, `'int'`, or `''` for "no opinion". */
  traffic?: string;
  note?: string;
}

export type EditFieldError = 'scheduledTime' | 'actualTime' | 'flightNo' | 'city';

export class EditRejectedError extends Error {
  readonly field: EditFieldError;
  constructor(field: EditFieldError) {
    super(`Invalid value for ${field}`);
    this.name = 'EditRejectedError';
    this.field = field;
  }
}

/** `''` clears the override; anything else has to read as a time. */
function readTime(value: string | undefined, field: EditFieldError): string | null {
  if (value === undefined || value.trim() === '') return null;

  const parsed = normalizeTime(value.trim());
  // A clamped 24:00 is recorded as 00:00 by the parser and is fine here too.
  if (parsed.kind !== 'time' && parsed.kind !== 'clamped') throw new EditRejectedError(field);
  return parsed.value;
}

function readText(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** The columns a patch sets, from what was typed. */
function columnsFrom(input: EditInput) {
  const city = input.city === undefined ? null : normalizeCity(input.city);
  const flightNo = input.flightNo === undefined ? null : normalizeFlightNo(input.flightNo);

  return {
    flightNo: flightNo?.display ?? null,
    cityRaw: city?.raw ?? null,
    cityKey: city?.key ?? null,
    scheduledTime: readTime(input.scheduledTime, 'scheduledTime'),
    actualTime: readTime(input.actualTime, 'actualTime'),
    aircraft: readText(input.aircraft),
    // Three states, not two: `dom`, `int`, and "nothing to say", which lets the
    // workbook's own value through. `normalizeIntl` is not reused because the
    // form speaks in its own tokens rather than the spreadsheet's.
    intl: input.traffic === 'int' ? true : input.traffic === 'dom' ? false : null,
    note: readText(input.note),
    updatedAt: new Date().toISOString(),
  };
}

/** The live workbook's own row for this flight, if it has one. */
function workbookRow(target: EditTarget) {
  return (
    getDb()
      .select({
        flightNo: flightEntries.flightNo,
        cityRaw: flightEntries.cityRaw,
        cityKey: flightEntries.cityKey,
        scheduledTime: flightEntries.scheduledTime,
        intl: flightEntries.intl,
        aircraft: flightEntries.aircraft,
      })
      .from(flightEntries)
      .innerJoin(scheduleUploads, eq(flightEntries.uploadId, scheduleUploads.id))
      .where(
        and(
          eq(scheduleUploads.isActive, true),
          eq(flightEntries.date, target.date),
          eq(flightEntries.kind, target.kind),
          eq(flightEntries.flightNoNorm, target.flightNoNorm)
        )
      )
      .limit(1)
      .all()[0] ?? null
  );
}

/**
 * Drops any override that merely repeats what the workbook already says.
 *
 * The form submits every box on every save, so without this, typing a note
 * would record the flight number, the city, the aircraft and the time as
 * overrides too. Two things go wrong then. The marker that tells staff "a human
 * changed this" appears on every field of every edited flight and stops meaning
 * anything. And, much worse, those values are pinned: a later workbook that
 * corrects the city would be silently overruled by a value nobody chose,
 * because the board prefers the edit.
 *
 * An override should exist only where a human actually disagreed with the file.
 */
function onlyDivergent(
  columns: ReturnType<typeof columnsFrom>,
  workbook: ReturnType<typeof workbookRow>
): ReturnType<typeof columnsFrom> {
  if (!workbook) return columns;

  return {
    ...columns,
    flightNo: columns.flightNo === workbook.flightNo ? null : columns.flightNo,
    cityRaw: columns.cityRaw === workbook.cityRaw ? null : columns.cityRaw,
    cityKey: columns.cityKey === workbook.cityKey ? null : columns.cityKey,
    scheduledTime: columns.scheduledTime === workbook.scheduledTime ? null : columns.scheduledTime,
    intl: columns.intl === workbook.intl ? null : columns.intl,
    aircraft: columns.aircraft === workbook.aircraft ? null : columns.aircraft,
  };
}

/**
 * Records a correction to a workbook flight, replacing any previous one.
 *
 * A whole-form upsert rather than a per-field patch: the form always submits
 * every box, so what it sends is the complete state of the correction. Merging
 * field by field would make an emptied box indistinguishable from a box the
 * form never rendered, and staff would have no way to undo a single change.
 */
export function saveFlightEdit(target: EditTarget, input: EditInput): void {
  const columns = onlyDivergent(columnsFrom(input), workbookRow(target));

  getDb()
    .insert(flightEdits)
    .values({
      id: crypto.randomUUID(),
      date: target.date,
      kind: target.kind,
      flightNoNorm: target.flightNoNorm,
      isAdded: false,
      isRemoved: false,
      ...columns,
    })
    .onConflictDoUpdate({
      target: [flightEdits.date, flightEdits.kind, flightEdits.flightNoNorm],
      // `isAdded` is deliberately absent: editing a flight staff added must not
      // demote it to an override of a workbook row that does not exist.
      set: { ...columns, isRemoved: false },
    })
    .run();
}

/**
 * Adds a flight no workbook contains.
 *
 * Refuses without a number, because the number is the identity — an addition
 * with none could never be found again, edited or removed.
 */
export function addFlight(
  date: string,
  kind: FlightKind,
  input: EditInput
): { flightNoNorm: string } {
  const flight = input.flightNo === undefined ? null : normalizeFlightNo(input.flightNo);
  if (!flight) throw new EditRejectedError('flightNo');

  const columns = columnsFrom(input);

  getDb()
    .insert(flightEdits)
    .values({
      id: crypto.randomUUID(),
      date,
      kind,
      flightNoNorm: flight.norm,
      isAdded: true,
      isRemoved: false,
      ...columns,
    })
    .onConflictDoUpdate({
      target: [flightEdits.date, flightEdits.kind, flightEdits.flightNoNorm],
      // Adding a flight that already has a patch revives it rather than
      // failing: the likeliest way to reach this is re-adding something removed
      // by mistake a minute earlier.
      set: { ...columns, isAdded: true, isRemoved: false },
    })
    .run();

  return { flightNoNorm: flight.norm };
}

/**
 * Takes a flight off the board, or puts it back.
 *
 * Nothing is destroyed either way. A workbook row gains a tombstone; an added
 * flight keeps its row and stops being rendered. That is what lets this be one
 * click with no typed confirmation, unlike deleting an upload — the worst case
 * is clicking the other button.
 */
export function setFlightRemoved(target: EditTarget, removed: boolean): void {
  getDb()
    .insert(flightEdits)
    .values({
      id: crypto.randomUUID(),
      date: target.date,
      kind: target.kind,
      flightNoNorm: target.flightNoNorm,
      isAdded: false,
      isRemoved: removed,
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: [flightEdits.date, flightEdits.kind, flightEdits.flightNoNorm],
      set: { isRemoved: removed, updatedAt: new Date().toISOString() },
    })
    .run();
}

/**
 * Throws the correction away, so the workbook's own values come back.
 *
 * The undo, and the reason the panel is not a one-way door. An added flight has
 * no workbook row behind it, so discarding its patch removes the flight
 * entirely — which is the right reading of "revert" for something that only
 * ever existed as a correction.
 */
export function clearFlightEdit(target: EditTarget): void {
  getDb()
    .delete(flightEdits)
    .where(
      and(
        eq(flightEdits.date, target.date),
        eq(flightEdits.kind, target.kind),
        eq(flightEdits.flightNoNorm, target.flightNoNorm)
      )
    )
    .run();
}

/** How many corrections exist from today onwards — for the dashboard. */
export function countUpcomingEdits(fromDate: string): number {
  const rows = getDb()
    .select({ total: sql<number>`count(*)` })
    .from(flightEdits)
    .where(sql`${flightEdits.date} >= ${fromDate}`)
    .all();

  return rows[0]?.total ?? 0;
}
