import 'server-only';

import * as XLSX from 'xlsx';

/**
 * Workbook reading (plan §5.1). Server-only: parsing spreadsheets in the
 * browser is a hard constraint violation (spec §3).
 *
 * ---------------------------------------------------------------------------
 * Why this does NOT use `XLSX.utils.sheet_to_json`
 * ---------------------------------------------------------------------------
 * The obvious recipe — `sheet_to_json(ws, { header: 1, raw: true })` — does not
 * return raw values. For any numeric cell whose number format is a date or
 * time format, SheetJS converts the value to a JavaScript `Date` **built in
 * the host's local timezone**, and `raw: true` does not suppress it.
 *
 * On the sample file that turns the date cell `45383` into
 * `2024-03-31T19:00:00Z` on a UTC+5 host. Read its UTC components and the
 * whole schedule shifts back by a day; read it on a UTC host and it does not.
 * That is precisely the class of bug plan §4 exists to make unrepresentable.
 *
 * The sheet object itself is correct — `ws['A3'].v === 45383`, a plain number —
 * so we walk cells directly and keep the raw values. It is also less code than
 * working around the conversion, and it gives us exact row/column indices for
 * diagnostics.
 */

export interface SheetGrid {
  sheetName: string;
  /** All sheet names, so a multi-sheet workbook can be reported. */
  sheetNames: string[];
  /**
   * Row-major raw cell values; index 0 is spreadsheet row 1. Blank rows are
   * preserved so the block scanner sees separators and diagnostics can cite
   * real row numbers.
   */
  rows: unknown[][];
  /** True if the workbook uses the 1904 date system, which we refuse. */
  is1904: boolean;
}

export class WorkbookReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkbookReadError';
  }
}

/** xlsx files are zip archives: `PK\x03\x04`. */
export function looksLikeXlsx(buffer: Buffer | Uint8Array): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  );
}

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

/**
 * Converts a `Date` back to an Excel serial using the date's **local**
 * components, because that is how SheetJS constructs them.
 *
 * Only reachable if a cell arrives typed as a date despite `cellDates: false`.
 * Normalising it here means exactly one place in the codebase knows about this
 * quirk, and everything downstream sees plain numbers.
 */
function dateToSerial(value: Date): number {
  const days =
    (Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) - EXCEL_EPOCH_UTC) /
    86_400_000;
  const secondsOfDay = value.getHours() * 3600 + value.getMinutes() * 60 + value.getSeconds();
  return days + secondsOfDay / 86_400;
}

export function readWorkbook(buffer: Buffer | Uint8Array): SheetGrid {
  if (!looksLikeXlsx(buffer)) {
    throw new WorkbookReadError(
      'File is not a valid .xlsx workbook (missing zip signature). ' +
        'A renamed .xls or .csv will not work — re-save it as .xlsx.'
    );
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, {
      // Keep serials as numbers. See the note above: this is necessary but not
      // sufficient, which is why we also avoid sheet_to_json.
      cellDates: false,
      cellNF: true,
      cellText: false,
      // We never evaluate formulas from an uploaded file.
      cellFormula: false,
    });
  } catch (cause) {
    throw new WorkbookReadError(
      `Could not read the workbook: ${cause instanceof Error ? cause.message : String(cause)}`
    );
  }

  const sheetNames = workbook.SheetNames ?? [];
  if (sheetNames.length === 0) throw new WorkbookReadError('The workbook contains no sheets.');

  const sheetName = sheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new WorkbookReadError(`Sheet "${sheetName}" could not be read.`);

  const rows: unknown[][] = [];
  const ref = sheet['!ref'];

  if (ref) {
    const range = XLSX.utils.decode_range(ref);
    for (let r = range.s.r; r <= range.e.r; r += 1) {
      const row: unknown[] = [];
      for (let c = range.s.c; c <= range.e.c; c += 1) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
        let value: unknown = cell?.v ?? null;
        if (value instanceof Date) value = dateToSerial(value);
        row.push(value);
      }
      rows.push(row);
    }
  }

  return {
    sheetName,
    sheetNames,
    rows,
    is1904: workbook.Workbook?.WBProps?.date1904 === true,
  };
}
