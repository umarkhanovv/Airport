import {
  DIAGNOSTIC,
  type Diagnostic,
  type ParsedDay,
  type ParsedFlightEntry,
  type ParseResult,
} from './types.ts';
import {
  isBlankCell,
  isBlankRow,
  normalizeCity,
  normalizeFlightNo,
  normalizeIntl,
  normalizeTime,
  parseFlightDate,
  weekdayName,
} from './normalize.ts';
import { isKnownCity } from './cities.ts';
import type { SheetGrid } from './workbook.ts';

/**
 * Block scanner, header mapper and turnaround splitter (plan §5.2, §5.3, §5.5).
 *
 * The file is seven repeating blocks:
 *   header row → date row → weekday row → flight rows → blank separator
 *
 * This module is deliberately free of I/O so it can be tested against
 * hand-built grids as well as real workbooks.
 */

/** Canonical columns in their canonical order, A..N. */
export const CANONICAL_HEADERS = [
  'DATE',
  'ARR',
  'ORG',
  'STA',
  'ETA',
  'RMA',
  'B',
  'DEP',
  'DES',
  'STD',
  'ETD',
  'RMD',
  'REG',
  'A/C',
] as const;

export type CanonicalHeader = (typeof CANONICAL_HEADERS)[number];

/**
 * Below this many matched headers we refuse to guess. Without it, the
 * positional fallback would happily turn an unrelated spreadsheet into
 * plausible-looking flights.
 */
const MIN_MATCHED_HEADERS = 6;

/** Stops a malformed file from being scanned into an enormous block. */
const MAX_ROWS_PER_BLOCK = 200;

export interface HeaderMap {
  columns: Partial<Record<CanonicalHeader, number>>;
  matched: number;
  assumed: CanonicalHeader[];
}

/**
 * Maps canonical column names to indices by NAME, then fills gaps by POSITION.
 *
 * The positional fallback is not defensive programming, it is required: in the
 * sample's Monday block, column L contains a single space instead of `RMD`
 * (plan §1.1a). A name-only map leaves `RMD` unmapped and every Monday
 * departure silently loses its domestic/international flag — while the data
 * rows below plainly say `DOM`.
 */
export function buildHeaderMap(row: readonly unknown[]): HeaderMap {
  const columns: Partial<Record<CanonicalHeader, number>> = {};
  const claimed = new Set<number>();

  row.forEach((cell, index) => {
    if (isBlankCell(cell)) return;
    const token = String(cell).trim().toUpperCase();
    const header = CANONICAL_HEADERS.find((h) => h === token);
    if (header && columns[header] === undefined) {
      columns[header] = index;
      claimed.add(index);
    }
  });

  const matched = Object.keys(columns).length;
  const assumed: CanonicalHeader[] = [];

  if (matched >= MIN_MATCHED_HEADERS) {
    CANONICAL_HEADERS.forEach((header, canonicalIndex) => {
      if (columns[header] !== undefined) return;
      if (claimed.has(canonicalIndex)) return;
      columns[header] = canonicalIndex;
      claimed.add(canonicalIndex);
      assumed.push(header);
    });
  }

  return { columns, matched, assumed };
}

function cellAt(row: readonly unknown[], index: number | undefined): unknown {
  if (index === undefined) return null;
  return row[index] ?? null;
}

function isHeaderRow(row: readonly unknown[] | undefined): boolean {
  if (!row) return false;
  return String(row[0] ?? '')
    .trim()
    .toUpperCase()
    .startsWith('DATE');
}

export function parseGrid(grid: SheetGrid): ParseResult {
  const diagnostics: Diagnostic[] = [];
  const entries: ParsedFlightEntry[] = [];
  const days: ParsedDay[] = [];
  const seenDates = new Map<string, number>();

  const push = (
    severity: Diagnostic['severity'],
    code: Diagnostic['code'],
    message: string,
    extra?: { row?: number; block?: number }
  ) => diagnostics.push({ severity, code, message, ...extra });

  if (grid.is1904) {
    push(
      'error',
      DIAGNOSTIC.DATE_1904,
      'This workbook uses the 1904 date system. Every date would be four years out. ' +
        'Re-save it from Excel with the default 1900 date system.'
    );
  }

  if (grid.sheetNames.length > 1) {
    push(
      'warning',
      DIAGNOSTIC.MULTIPLE_SHEETS,
      `The workbook has ${grid.sheetNames.length} sheets; only "${grid.sheetName}" was read.`
    );
  }

  const { rows } = grid;
  let index = 0;
  let blockNumber = 0;

  while (index < rows.length) {
    if (!isHeaderRow(rows[index])) {
      index += 1;
      continue;
    }

    blockNumber += 1;
    const headerRowNumber = index + 1; // 1-based, as shown in Excel
    const header = buildHeaderMap(rows[index]);

    if (header.matched < MIN_MATCHED_HEADERS) {
      push(
        'error',
        DIAGNOSTIC.MALFORMED_HEADER,
        `Row ${headerRowNumber}: only ${header.matched} of the expected columns were recognised ` +
          `(need at least ${MIN_MATCHED_HEADERS}). Expected: ${CANONICAL_HEADERS.join(', ')}.`,
        { row: headerRowNumber, block: blockNumber }
      );
      index += 1;
      continue;
    }

    for (const assumed of header.assumed) {
      const column = header.columns[assumed]!;
      push(
        'warning',
        DIAGNOSTIC.HEADER_ASSUMED,
        `Row ${headerRowNumber}: header "${assumed}" is missing or blank; ` +
          `assumed column ${columnLetter(column)} from the standard layout.`,
        { row: headerRowNumber, block: blockNumber }
      );
    }

    // --- date row -----------------------------------------------------------
    let cursor = index + 1;
    while (cursor < rows.length && isBlankRow(rows[cursor])) cursor += 1;

    const dateRowNumber = cursor + 1;
    const dateCell = cellAt(rows[cursor] ?? [], header.columns.DATE ?? 0);
    const parsedDate = parseFlightDate(dateCell);

    if (parsedDate.kind === 'invalid') {
      push(
        'error',
        DIAGNOSTIC.UNPARSEABLE_DATE,
        `Row ${dateRowNumber}: could not read a date from "${parsedDate.raw}". ` +
          'Expected an Excel date or a value like 01.04.2024.',
        { row: dateRowNumber, block: blockNumber }
      );
      index = cursor + 1;
      continue;
    }

    const date = parsedDate.value;
    if (seenDates.has(date)) {
      push(
        'error',
        DIAGNOSTIC.DUPLICATE_DATE_BLOCK,
        `Row ${dateRowNumber}: ${date} already appeared in the block at row ${seenDates.get(date)}.`,
        { row: dateRowNumber, block: blockNumber }
      );
    } else {
      seenDates.set(date, dateRowNumber);
    }

    // --- weekday row (cross-check only; the date wins) -----------------------
    cursor += 1;
    let weekday: string | null = null;
    const weekdayCell = cellAt(rows[cursor] ?? [], header.columns.DATE ?? 0);
    if (typeof weekdayCell === 'string' && /^[A-Za-z]{3,}$/.test(weekdayCell.trim())) {
      weekday = weekdayCell.trim().toUpperCase();
      const expected = weekdayName(date);
      if (weekday !== expected) {
        push(
          'warning',
          DIAGNOSTIC.WEEKDAY_MISMATCH,
          `Row ${cursor + 1}: the file says ${weekday} but ${date} is a ${expected}. ` +
            'Using the date.',
          { row: cursor + 1, block: blockNumber }
        );
      }
      cursor += 1;
    }

    // --- flight rows ---------------------------------------------------------
    let arrivals = 0;
    let departures = 0;
    let scanned = 0;

    while (cursor < rows.length && scanned < MAX_ROWS_PER_BLOCK) {
      const row = rows[cursor];
      if (isBlankRow(row) || isHeaderRow(row)) break;

      const rowNumber = cursor + 1;
      const turnaroundKey = `${date}#${rowNumber}`;
      const aircraftCell = cellAt(row, header.columns['A/C']);
      const aircraft = isBlankCell(aircraftCell) ? null : String(aircraftCell).trim();

      const made = buildEntries({
        row,
        header,
        date,
        rowNumber,
        turnaroundKey,
        aircraft,
        blockNumber,
        push,
      });

      for (const entry of made) {
        entries.push(entry);
        if (entry.kind === 'arrival') arrivals += 1;
        else departures += 1;
      }

      cursor += 1;
      scanned += 1;
    }

    days.push({ date, weekday, arrivals, departures });
    index = cursor;
  }

  if (blockNumber === 0) {
    push(
      'error',
      DIAGNOSTIC.NO_DATE_BLOCKS,
      'No day blocks were found. Each day must start with a row whose first cell is "DATE".'
    );
  } else if (entries.length === 0) {
    push('error', DIAGNOSTIC.NO_ENTRIES, 'No flights were found in any day block.');
  }

  const sortedDates = days.map((d) => d.date).sort();
  if (sortedDates.length > 1 && !isContiguous(sortedDates)) {
    push(
      'warning',
      DIAGNOSTIC.NON_CONTIGUOUS_DATES,
      `The file covers ${sortedDates.length} days that are not consecutive ` +
        `(${sortedDates[0]} … ${sortedDates[sortedDates.length - 1]}).`
    );
  }

  return {
    ok: !diagnostics.some((d) => d.severity === 'error'),
    entries,
    days,
    diagnostics,
    weekStart: sortedDates[0] ?? null,
    weekEnd: sortedDates[sortedDates.length - 1] ?? null,
    sheetName: grid.sheetName,
  };
}

interface BuildArgs {
  row: readonly unknown[];
  header: HeaderMap;
  date: string;
  rowNumber: number;
  turnaroundKey: string;
  aircraft: string | null;
  blockNumber: number;
  push: (
    severity: Diagnostic['severity'],
    code: Diagnostic['code'],
    message: string,
    extra?: { row?: number; block?: number }
  ) => void;
}

/**
 * Splits one turnaround row into up to two independent entries.
 *
 * The two halves are never derived from each other. On the sample's Wednesday,
 * `DV 762` arrives from AKTAU while `DV 763` departs to URALSK on the same row
 * (plan §1.1e) — inferring the destination from the origin would put the
 * aircraft in the wrong city.
 */
function buildEntries(args: BuildArgs): ParsedFlightEntry[] {
  const { row, header, date, rowNumber, turnaroundKey, aircraft, blockNumber, push } = args;
  const out: ParsedFlightEntry[] = [];

  const halves = [
    {
      kind: 'arrival' as const,
      flightCol: header.columns.ARR,
      cityCol: header.columns.ORG,
      timeCol: header.columns.STA,
      flagCol: header.columns.RMA,
      label: 'arrival',
    },
    {
      kind: 'departure' as const,
      flightCol: header.columns.DEP,
      cityCol: header.columns.DES,
      timeCol: header.columns.STD,
      flagCol: header.columns.RMD,
      label: 'departure',
    },
  ];

  for (const half of halves) {
    const flight = normalizeFlightNo(cellAt(row, half.flightCol));
    if (!flight) continue;

    const city = normalizeCity(cellAt(row, half.cityCol));
    if (!city) {
      push(
        'warning',
        DIAGNOSTIC.MISSING_CITY,
        `Row ${rowNumber}: ${half.label} ${flight.display} has no city.`,
        { row: rowNumber, block: blockNumber }
      );
    } else if (!isKnownCity(city.key)) {
      push(
        'warning',
        DIAGNOSTIC.UNKNOWN_CITY,
        `Row ${rowNumber}: "${city.raw}" is not in the city dictionary. ` +
          'The flight will show, but without a translated name or weather.',
        { row: rowNumber, block: blockNumber }
      );
    }

    const time = normalizeTime(cellAt(row, half.timeCol));
    let scheduledTime: string | null = null;

    switch (time.kind) {
      case 'time':
        scheduledTime = time.value;
        break;
      case 'clamped':
        scheduledTime = time.value;
        push(
          'warning',
          DIAGNOSTIC.MIDNIGHT_CLAMPED,
          `Row ${rowNumber}: ${half.label} ${flight.display} rounded to 24:00; recorded as 00:00.`,
          { row: rowNumber, block: blockNumber }
        );
        break;
      case 'empty':
        push(
          'warning',
          DIAGNOSTIC.MISSING_TIME,
          `Row ${rowNumber}: ${half.label} ${flight.display} has no scheduled time.`,
          { row: rowNumber, block: blockNumber }
        );
        break;
      case 'invalid':
        push(
          'warning',
          DIAGNOSTIC.INVALID_TIME,
          `Row ${rowNumber}: could not read "${time.raw}" as a time for ${half.label} ${flight.display}.`,
          { row: rowNumber, block: blockNumber }
        );
        break;
    }

    const intl = normalizeIntl(cellAt(row, half.flagCol));
    if (intl === null) {
      push(
        'warning',
        DIAGNOSTIC.UNKNOWN_DOM_INT,
        `Row ${rowNumber}: ${half.label} ${flight.display} is neither DOM nor INT; ` +
          'shown without a domestic/international label.',
        { row: rowNumber, block: blockNumber }
      );
    }

    out.push({
      kind: half.kind,
      date,
      flightNo: flight.display,
      flightNoNorm: flight.norm,
      cityRaw: city?.raw ?? '',
      cityKey: city?.key ?? '',
      scheduledTime,
      intl,
      aircraft,
      turnaroundKey,
      sourceRow: rowNumber,
    });
  }

  return out;
}

function isContiguous(sortedDates: string[]): boolean {
  for (let i = 1; i < sortedDates.length; i += 1) {
    const previous = Date.parse(`${sortedDates[i - 1]}T00:00:00Z`);
    const current = Date.parse(`${sortedDates[i]}T00:00:00Z`);
    if (current - previous !== 86_400_000) return false;
  }
  return true;
}

export function columnLetter(index: number): string {
  let n = index;
  let letters = '';
  do {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letters;
}
