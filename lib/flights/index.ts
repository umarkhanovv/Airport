import 'server-only';

import { parseGrid } from './parse.ts';
import type { ParseResult } from './types.ts';
import { readWorkbook, WorkbookReadError } from './workbook.ts';
import { DIAGNOSTIC } from './types.ts';

export * from './types.ts';
export { CANONICAL_HEADERS, buildHeaderMap, parseGrid, columnLetter } from './parse.ts';
export { looksLikeXlsx, WorkbookReadError } from './workbook.ts';
export * from './cities.ts';
export * from './normalize.ts';

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
