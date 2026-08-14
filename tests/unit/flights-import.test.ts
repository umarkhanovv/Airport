import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import * as schema from '@/lib/db/schema';
import { flightEntries, scheduleUploads } from '@/lib/db/schema';
import {
  deleteScheduleUpload,
  ImportRefusedError,
  publishSchedule,
  setActiveSchedule,
  sha256,
} from '@/lib/flights/import';
import { parseScheduleWorkbook } from '@/lib/flights';
import type { ParseResult } from '@/lib/flights';

const FIXTURE = path.resolve(__dirname, '../fixtures/sample_weekly_schedule.xlsx');
const MIGRATIONS = path.resolve(__dirname, '../../lib/db/migrations');

function freshDb() {
  const db = drizzle(new Database(':memory:'), { schema });
  migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

const meta = (name = 'week.xlsx') => ({
  originalFilename: name,
  storedPath: `uploads/schedules/${name}`,
  sha256: sha256(Buffer.from(name)),
});

let db: ReturnType<typeof freshDb>;
let parsed: ParseResult;

beforeEach(() => {
  db = freshDb();
  parsed = parseScheduleWorkbook(fs.readFileSync(FIXTURE));
});

describe('publishing a schedule', () => {
  it('writes every entry and marks the upload active', () => {
    const outcome = publishSchedule(db, parsed, meta());

    expect(outcome.entryCount).toBe(38);
    expect(outcome.weekStart).toBe('2024-04-01');
    expect(outcome.weekEnd).toBe('2024-04-07');

    expect(db.select().from(flightEntries).all()).toHaveLength(38);
    const uploads = db.select().from(scheduleUploads).all();
    expect(uploads).toHaveLength(1);
    expect(uploads[0].isActive).toBe(true);
  });

  it('stores times as HH:MM text, never as a timestamp', () => {
    publishSchedule(db, parsed, meta());
    for (const row of db.select().from(flightEntries).all()) {
      expect(row.scheduledTime).toMatch(/^\d{2}:\d{2}$/);
      expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('keeps the diagnostics with the upload for the admin to re-read', () => {
    publishSchedule(db, parsed, meta());
    const [upload] = db.select().from(scheduleUploads).all();
    const warnings = JSON.parse(upload.warnings) as Array<{ code: string }>;
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe('header-assumed-by-position');
  });

  it('sorts chronologically by lexical time, including post-midnight', () => {
    publishSchedule(db, parsed, meta());
    const saturday = db
      .select()
      .from(flightEntries)
      .where(eq(flightEntries.date, '2024-04-06'))
      .all()
      .filter((r) => r.kind === 'arrival')
      .sort((a, b) => (a.scheduledTime ?? '').localeCompare(b.scheduledTime ?? ''));

    expect(saturday[0].scheduledTime).toBe('00:20');
    expect(saturday.at(-1)!.scheduledTime).toBe('16:25');
  });
});

describe('replacing a schedule', () => {
  it('deactivates the previous upload but never deletes it', () => {
    const first = publishSchedule(db, parsed, meta('week1.xlsx'));
    const second = publishSchedule(db, parsed, meta('week2.xlsx'));

    const uploads = db.select().from(scheduleUploads).all();
    expect(uploads, 'the old workbook must remain downloadable').toHaveLength(2);

    const active = uploads.filter((u) => u.isActive);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(second.uploadId);
    expect(uploads.find((u) => u.id === first.uploadId)!.isActive).toBe(false);
  });

  it('keeps exactly one active upload no matter how many are published', () => {
    for (let i = 0; i < 5; i += 1) publishSchedule(db, parsed, meta(`week${i}.xlsx`));
    expect(
      db
        .select()
        .from(scheduleUploads)
        .all()
        .filter((u) => u.isActive)
    ).toHaveLength(1);
    expect(db.select().from(flightEntries).all()).toHaveLength(38 * 5);
  });
});

describe('failure leaves the board untouched', () => {
  it('refuses to publish a parse result that has errors', () => {
    const broken = parseScheduleWorkbook(Buffer.from('not a workbook'));
    expect(() => publishSchedule(db, broken, meta())).toThrow(ImportRefusedError);
    expect(db.select().from(scheduleUploads).all()).toHaveLength(0);
  });

  it('rolls back completely when a write fails mid-transaction', () => {
    const good = publishSchedule(db, parsed, meta('good.xlsx'));

    // Force a failure part-way through the next publish by violating the
    // natural key: two identical entries in one upload.
    const duplicated: ParseResult = {
      ...parsed,
      entries: [...parsed.entries, { ...parsed.entries[0] }],
    };

    expect(() => publishSchedule(db, duplicated, meta('bad.xlsx'))).toThrow();

    // The previous schedule must still be intact and still serving.
    const uploads = db.select().from(scheduleUploads).all();
    expect(uploads).toHaveLength(1);
    expect(uploads[0].id).toBe(good.uploadId);
    expect(uploads[0].isActive).toBe(true);
    expect(db.select().from(flightEntries).all()).toHaveLength(38);
  });

  it('cascades entry deletion when an upload is removed', () => {
    const outcome = publishSchedule(db, parsed, meta());
    db.delete(scheduleUploads).where(eq(scheduleUploads.id, outcome.uploadId)).run();
    expect(db.select().from(flightEntries).all()).toHaveLength(0);
  });
});

describe('choosing what the board shows', () => {
  it('makes an earlier upload live again, standing the current one down', () => {
    const first = publishSchedule(db, parsed, meta('week1.xlsx'));
    publishSchedule(db, parsed, meta('week2.xlsx'));

    setActiveSchedule(db, first.uploadId);

    const active = db
      .select()
      .from(scheduleUploads)
      .where(eq(scheduleUploads.isActive, true))
      .all();
    expect(active, 'exactly one upload may be live').toHaveLength(1);
    expect(active[0].id).toBe(first.uploadId);
  });

  it('can leave nothing live at all', () => {
    publishSchedule(db, parsed, meta('week1.xlsx'));

    setActiveSchedule(db, null);

    expect(
      db.select().from(scheduleUploads).where(eq(scheduleUploads.isActive, true)).all()
    ).toHaveLength(0);
    // The upload itself survives — this is the reversible half of removing it.
    expect(db.select().from(scheduleUploads).all()).toHaveLength(1);
    expect(db.select().from(flightEntries).all()).toHaveLength(38);
  });
});

describe('deleting a schedule', () => {
  it('takes its flights with it and reports the workbook to unlink', () => {
    const first = publishSchedule(db, parsed, meta('week1.xlsx'));
    const second = publishSchedule(db, parsed, meta('week2.xlsx'));
    expect(db.select().from(flightEntries).all()).toHaveLength(76);

    const storedPath = deleteScheduleUpload(db, first.uploadId);

    expect(storedPath, 'the caller needs this to unlink the file').toBe(
      'uploads/schedules/week1.xlsx'
    );
    expect(db.select().from(scheduleUploads).all()).toHaveLength(1);

    // The cascade is the point: orphaned flight rows would still be readable.
    const remaining = db.select().from(flightEntries).all();
    expect(remaining).toHaveLength(38);
    expect(remaining.every((row) => row.uploadId === second.uploadId)).toBe(true);
  });

  it('leaves nothing live when the live schedule is the one deleted', () => {
    publishSchedule(db, parsed, meta('week1.xlsx'));
    const live = publishSchedule(db, parsed, meta('week2.xlsx'));

    deleteScheduleUpload(db, live.uploadId);

    // Deliberately not promoting the predecessor: putting a different week on
    // the board because somebody deleted this one is a surprise a flight board
    // must not spring. The remaining upload is still there to be chosen.
    expect(
      db.select().from(scheduleUploads).where(eq(scheduleUploads.isActive, true)).all()
    ).toHaveLength(0);
    expect(db.select().from(scheduleUploads).all()).toHaveLength(1);
  });

  it('is a no-op for an id that does not exist', () => {
    publishSchedule(db, parsed, meta('week1.xlsx'));

    expect(deleteScheduleUpload(db, 'no-such-upload')).toBeNull();
    expect(db.select().from(scheduleUploads).all()).toHaveLength(1);
  });
});
