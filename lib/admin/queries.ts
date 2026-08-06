import 'server-only';

import { desc } from 'drizzle-orm';

import { getDb } from '../db/index.ts';
import { scheduleUploads } from '../db/schema.ts';
import type { Diagnostic } from '../flights/types.ts';

/**
 * Admin-side reads.
 *
 * Kept apart from `lib/flights/queries.ts`, which answers only "what should the
 * public board show". This file answers "what has staff done", including
 * superseded uploads the board must never surface.
 */

export interface UploadHistoryRow {
  id: string;
  originalFilename: string;
  uploadedAt: string;
  weekStart: string | null;
  weekEnd: string | null;
  entryCount: number;
  isActive: boolean;
  warnings: Diagnostic[];
}

function parseWarnings(raw: string): Diagnostic[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Diagnostic[]) : [];
  } catch {
    // A malformed warnings blob is not worth failing the whole history page for.
    return [];
  }
}

/** Every upload ever published, newest first. Old ones are retained (plan §5.8). */
export function listScheduleUploads(limit = 20): UploadHistoryRow[] {
  const rows = getDb()
    .select()
    .from(scheduleUploads)
    .orderBy(desc(scheduleUploads.uploadedAt))
    .limit(limit)
    .all();

  return rows.map((row) => ({
    id: row.id,
    originalFilename: row.originalFilename,
    uploadedAt: row.uploadedAt,
    weekStart: row.weekStart,
    weekEnd: row.weekEnd,
    entryCount: row.entryCount,
    isActive: row.isActive,
    warnings: parseWarnings(row.warnings),
  }));
}
