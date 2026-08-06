import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Upload staging (plan §9.1).
 *
 * Two properties matter here and nothing else does: a file that is not really a
 * workbook never reaches the parser, and a staged id never becomes a path.
 * `DATA_DIR` is read at module load, so each test re-imports the module against
 * a fresh temporary directory.
 */

const SAMPLE = path.resolve(import.meta.dirname, '../fixtures/sample_weekly_schedule.xlsx');

let tmp: string;
let uploads: typeof import('@/lib/admin/uploads');

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hsa-uploads-'));
  process.env.DATA_DIR = tmp;

  vi.resetModules();
  uploads = await import('@/lib/admin/uploads');
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

describe('stageUpload validation', () => {
  it('refuses an empty file', () => {
    expect(() => uploads.stageUpload(Buffer.alloc(0), 'week.xlsx')).toThrow(
      uploads.UploadRejectedError
    );
  });

  it('refuses a file over 5 MB', () => {
    const tooBig = Buffer.alloc(uploads.MAX_SCHEDULE_BYTES + 1);
    expect(() => uploads.stageUpload(tooBig, 'week.xlsx')).toThrow(/5 MB/);
  });

  it('refuses content that is not a zip, whatever it is named', () => {
    // The whole point: `.xlsx` in the name proves nothing. xlsx is a zip.
    const html = Buffer.from('<!doctype html><html>gotcha</html>', 'utf8');
    expect(() => uploads.stageUpload(html, 'week.xlsx')).toThrow(/not an .xlsx workbook/);

    const pdf = Buffer.from('%PDF-1.7\n', 'utf8');
    expect(() => uploads.stageUpload(pdf, 'schedule.xlsx')).toThrow(uploads.UploadRejectedError);
  });

  it('accepts the real sample workbook', () => {
    const buffer = fs.readFileSync(SAMPLE);
    const record = uploads.stageUpload(buffer, 'sample_weekly_schedule.xlsx');

    expect(record.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(record.sizeBytes).toBe(buffer.length);
    expect(record.sha256).toHaveLength(64);
    expect(record.originalFilename).toBe('sample_weekly_schedule.xlsx');
  });

  it('keeps the uploaded name for display but strips any directory from it', () => {
    const buffer = fs.readFileSync(SAMPLE);

    expect(uploads.stageUpload(buffer, '../../../etc/passwd').originalFilename).toBe('passwd');
    expect(uploads.stageUpload(buffer, 'C:\\Users\\staff\\week.xlsx').originalFilename).toBe(
      'week.xlsx'
    );
  });
});

describe('readStagedUpload', () => {
  it('round-trips the staged bytes', () => {
    const buffer = fs.readFileSync(SAMPLE);
    const { id } = uploads.stageUpload(buffer, 'week.xlsx');

    const staged = uploads.readStagedUpload(id);
    expect(staged).not.toBeNull();
    expect(staged!.buffer.equals(buffer)).toBe(true);
    expect(staged!.record.originalFilename).toBe('week.xlsx');
  });

  it('returns null for a well-formed id that was never staged', () => {
    expect(uploads.readStagedUpload('11111111-2222-4333-8444-555555555555')).toBeNull();
  });

  it('refuses an id that is not a UUID rather than building a path from it', () => {
    for (const evil of [
      '../../../../etc/passwd',
      '..',
      'a/../../b',
      'week.xlsx',
      '',
      '11111111-2222-4333-8444-555555555555/../../secret',
    ]) {
      expect(() => uploads.readStagedUpload(evil), `${evil} must be refused`).toThrow(
        uploads.UploadRejectedError
      );
    }
  });
});

describe('promoteStagedUpload and discardStagedUpload', () => {
  it('copies the workbook into permanent storage under DATA_DIR', () => {
    const buffer = fs.readFileSync(SAMPLE);
    const { id } = uploads.stageUpload(buffer, 'week.xlsx');

    const storedPath = uploads.promoteStagedUpload(id);

    expect(path.isAbsolute(storedPath)).toBe(false);
    const absolute = path.join(tmp, storedPath);
    expect(fs.existsSync(absolute)).toBe(true);
    expect(fs.readFileSync(absolute).equals(buffer)).toBe(true);
  });

  it('leaves the promoted copy in place when the staged original is discarded', () => {
    const buffer = fs.readFileSync(SAMPLE);
    const { id } = uploads.stageUpload(buffer, 'week.xlsx');
    const storedPath = uploads.promoteStagedUpload(id);

    uploads.discardStagedUpload(id);

    // The published workbook must survive — the public download link points at it.
    expect(fs.existsSync(path.join(tmp, storedPath))).toBe(true);
    expect(uploads.readStagedUpload(id)).toBeNull();
  });

  it('refuses to promote or discard a non-UUID id', () => {
    expect(() => uploads.promoteStagedUpload('../../etc/passwd')).toThrow(
      uploads.UploadRejectedError
    );
    expect(() => uploads.discardStagedUpload('../../etc/passwd')).toThrow(
      uploads.UploadRejectedError
    );
  });
});
