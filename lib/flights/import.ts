import 'server-only';

import crypto from 'node:crypto';

import { eq, ne } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import * as schema from '../db/schema.ts';
import { flightEntries, scheduleUploads } from '../db/schema.ts';

import type { ParseResult } from './types.ts';

export type FlightsDb = BetterSQLite3Database<typeof schema>;

export interface ImportMeta {
  originalFilename: string;
  /** Path on disk, relative to DATA_DIR. Written before the transaction. */
  storedPath: string;
  sha256: string;
}

export interface ImportOutcome {
  uploadId: string;
  entryCount: number;
  weekStart: string | null;
  weekEnd: string | null;
}

export class ImportRefusedError extends Error {
  readonly diagnostics: ParseResult['diagnostics'];
  constructor(diagnostics: ParseResult['diagnostics']) {
    super('Refusing to publish a schedule that failed validation.');
    this.name = 'ImportRefusedError';
    this.diagnostics = diagnostics;
  }
}

export function sha256(buffer: Buffer | Uint8Array): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/** SQLite's default variable ceiling is 999; 200 rows × 13 columns stays clear. */
const INSERT_CHUNK = 200;

/**
 * Publishes a parsed schedule (plan §5.8).
 *
 * The ordering matters and is not incidental:
 *
 *   BEGIN
 *     insert the new upload, inactive
 *     insert its flight entries
 *     deactivate every other upload
 *     activate this one
 *   COMMIT
 *
 * Publishing never deletes the previous schedule, and does not even deactivate
 * it until the replacement is fully written. If anything fails — a malformed
 * row, a disk error, a crash — the transaction rolls back and the board carries
 * on serving exactly what it served before. A flight board must never go blank
 * because an upload failed at 2am.
 *
 * Old uploads are retained: their workbooks stay on disk, and a bad publish is
 * undone by making an earlier one live again. Staff can now do that from the
 * dashboard — `setActiveSchedule` and `deleteScheduleUpload` below — where once
 * this function was the only thing in the codebase that could write
 * `is_active`. Removing an upload is therefore a deliberate act by somebody who
 * typed its week back to confirm, never a side effect of publishing.
 */
export function publishSchedule(
  db: FlightsDb,
  parsed: ParseResult,
  meta: ImportMeta
): ImportOutcome {
  if (!parsed.ok || parsed.entries.length === 0) {
    throw new ImportRefusedError(parsed.diagnostics);
  }

  const uploadId = crypto.randomUUID();

  return db.transaction((tx) => {
    tx.insert(scheduleUploads)
      .values({
        id: uploadId,
        originalFilename: meta.originalFilename,
        storedPath: meta.storedPath,
        sha256: meta.sha256,
        uploadedAt: new Date().toISOString(),
        weekStart: parsed.weekStart,
        weekEnd: parsed.weekEnd,
        entryCount: parsed.entries.length,
        warnings: JSON.stringify(parsed.diagnostics),
        isActive: false,
      })
      .run();

    const rows = parsed.entries.map((entry) => ({
      id: crypto.randomUUID(),
      uploadId,
      kind: entry.kind,
      date: entry.date,
      flightNo: entry.flightNo,
      flightNoNorm: entry.flightNoNorm,
      cityRaw: entry.cityRaw,
      cityKey: entry.cityKey,
      scheduledTime: entry.scheduledTime,
      intl: entry.intl,
      aircraft: entry.aircraft,
      turnaroundKey: entry.turnaroundKey,
      sourceRow: entry.sourceRow,
    }));

    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      tx.insert(flightEntries)
        .values(rows.slice(i, i + INSERT_CHUNK))
        .run();
    }

    // Only now is the previous schedule stood down.
    tx.update(scheduleUploads)
      .set({ isActive: false })
      .where(ne(scheduleUploads.id, uploadId))
      .run();
    tx.update(scheduleUploads)
      .set({ isActive: true })
      .where(eq(scheduleUploads.id, uploadId))
      .run();

    return {
      uploadId,
      entryCount: rows.length,
      weekStart: parsed.weekStart,
      weekEnd: parsed.weekEnd,
    };
  });
}

/**
 * Makes one upload the live schedule, or takes every schedule off the board.
 *
 * `publishSchedule` above was the only writer of `is_active` for a long time,
 * which meant the board showed whatever was uploaded last and nothing else —
 * fine until a week is published by mistake, or a test schedule needs taking
 * down. Staff can now choose.
 *
 * Passing `null` deactivates everything and leaves the board empty. That is a
 * real state the public site already handles: `getActiveSchedule` returns null,
 * every consumer null-checks it, and the visitor is told no schedule has been
 * published rather than being shown last month's flights under today's date.
 *
 * One statement per branch inside a transaction, so there is never an instant
 * where two uploads are live or where the board is briefly blank mid-switch.
 */
export function setActiveSchedule(db: FlightsDb, uploadId: string | null): void {
  db.transaction((tx) => {
    tx.update(scheduleUploads).set({ isActive: false }).run();

    if (uploadId !== null) {
      tx.update(scheduleUploads)
        .set({ isActive: true })
        .where(eq(scheduleUploads.id, uploadId))
        .run();
    }
  });
}

/**
 * Removes an upload, its flights and its workbook.
 *
 * Irreversible, and the only irreversible thing in the schedule panel — which
 * is why the form in front of it asks for the week to be typed back, and why
 * taking a schedule off the board is offered separately as the undoable
 * version of "make this go away".
 *
 * The flight rows go with it through `ON DELETE CASCADE` (enabled by the
 * `foreign_keys` pragma in `lib/db/index.ts` — without it SQLite ignores the
 * constraint silently). The row is read first so the workbook can be unlinked
 * after: a missing file is not worth failing over, but a deleted row pointing
 * at a file nobody will ever reach is just litter on the volume.
 *
 * Deleting the live schedule leaves nothing live. That is deliberate rather
 * than promoting a predecessor: quietly putting a different week on the board
 * because somebody deleted the current one is the kind of surprise a flight
 * board must not spring.
 */
export function deleteScheduleUpload(db: FlightsDb, uploadId: string): string | null {
  const rows = db.select().from(scheduleUploads).where(eq(scheduleUploads.id, uploadId)).all();

  const row = rows[0];
  if (!row) return null;

  db.delete(scheduleUploads).where(eq(scheduleUploads.id, uploadId)).run();

  return row.storedPath;
}
