import 'server-only';

import { parseGrid } from './parse.ts';
import type { ParseResult } from './types.ts';
import { readWorkbook, WorkbookReadError } from './workbook.ts';
import { DIAGNOSTIC } from './types.ts';

/*
 * One entry point, and only what callers actually take through it.
 *
 * This used to re-export the parser internals, the workbook reader, the city
 * table and the normalizers as well. Nothing imported any of them from here —
 * the modules that need `parseGrid` or `cityDisplayName` import those files
 * directly — so the barrel was advertising an API surface that existed only to
 * be maintained. Callers take `parseScheduleWorkbook` below, plus `ParseResult`
 * and `DIAGNOSTIC` from the types.
 */
export * from './types.ts';

/**
 * Parses an uploaded weekly schedule workbook.
 *
 * Never throws for bad input: a malformed file comes back as a `ParseResult`
 * with `ok: false` and diagnostics that cite real spreadsheet rows, which is
 * what the admin preview screen renders (spec §8).
 */
export function parseScheduleWorkbook(buffer: Buffer | Uint8Array): ParseResult {
  try {
    return parseGrid(readWorkbook(buffer));
  } catch (cause) {
    if (cause instanceof WorkbookReadError) {
      return {
        ok: false,
        entries: [],
        days: [],
        diagnostics: [
          { severity: 'error', code: DIAGNOSTIC.NOT_A_WORKBOOK, message: cause.message },
        ],
        weekStart: null,
        weekEnd: null,
        sheetName: null,
      };
    }
    throw cause;
  }
}
