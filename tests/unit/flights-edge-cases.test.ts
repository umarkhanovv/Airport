import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import { buildHeaderMap, parseGrid } from '@/lib/flights/parse';
import { DIAGNOSTIC, type Diagnostic } from '@/lib/flights/types';
import { parseScheduleWorkbook } from '@/lib/flights';
import type { SheetGrid } from '@/lib/flights/workbook';

/**
 * Synthetic edge cases (plan §5.7).
 *
 * Most work on hand-built grids, which keeps them readable and lets each one
 * isolate a single defect. The cases that exercise the upload path — a
 * non-workbook, a 1904 workbook, multiple sheets — build real .xlsx buffers.
 */

const HEADER = [
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
];

function grid(rows: unknown[][]): SheetGrid {
  return { sheetName: 'Sheet1', sheetNames: ['Sheet1'], rows, is1904: false };
}

/** One well-formed day block: header, date, weekday, then the given flights. */
function block(date: number | string, flights: unknown[][], header: unknown[] = HEADER) {
  return [header, [date], ['MONDAY'], ...flights];
}

function flight(opts: {
  arr?: string;
  org?: string;
  sta?: unknown;
  rma?: string;
  dep?: string;
  des?: string;
  std?: unknown;
  rmd?: string;
  ac?: string;
}) {
  const row = new Array(14).fill(null);
  row[1] = opts.arr ?? null;
  row[2] = opts.org ?? null;
  row[3] = opts.sta ?? null;
  row[5] = opts.rma ?? null;
  row[7] = opts.dep ?? null;
  row[8] = opts.des ?? null;
  row[9] = opts.std ?? null;
  row[11] = opts.rmd ?? null;
  row[13] = opts.ac ?? null;
  return row;
}

const codes = (d: Diagnostic[]) => d.map((x) => x.code);
const errors = (d: Diagnostic[]) => d.filter((x) => x.severity === 'error');
const warnings = (d: Diagnostic[]) => d.filter((x) => x.severity === 'warning');

// 45383 = 2024-04-01
const MONDAY = 45383;

describe('header mapping', () => {
  it('maps a complete header row by name', () => {
    const map = buildHeaderMap(HEADER);
    expect(map.matched).toBe(14);
    expect(map.assumed).toEqual([]);
    expect(map.columns.RMD).toBe(11);
  });

  it('fills a blank RMD header from its canonical position', () => {
    const withBlank = [...HEADER];
    withBlank[11] = ' '; // exactly what the sample file contains
    const map = buildHeaderMap(withBlank);
    expect(map.columns.RMD).toBe(11);
    expect(map.assumed).toContain('RMD');
  });

  it('still parses with two headers missing', () => {
    const missing: unknown[] = [...HEADER];
    missing[11] = ' '; // blank, as in the sample
    missing[4] = null; // absent entirely
    const result = parseGrid(
      grid(
        block(MONDAY, [flight({ dep: 'IQ 366', des: 'AKTOBE', std: '13:00', rmd: 'DOM' })], missing)
      )
    );
    expect(errors(result.diagnostics)).toEqual([]);
    expect(result.entries[0].intl).toBe(false);
  });

  it('refuses to guess when fewer than six headers are recognised', () => {
    // Without this floor the positional fallback would turn an unrelated
    // spreadsheet into plausible-looking flights.
    const junk = ['DATE', 'NAME', 'EMAIL', 'PHONE', 'NOTE', null, null, null];
    const result = parseGrid(grid([junk, [MONDAY], ['MONDAY'], ['x', 'y']]));
    expect(codes(errors(result.diagnostics))).toContain(DIAGNOSTIC.MALFORMED_HEADER);
    expect(result.ok).toBe(false);
  });

  it('does not let the fallback steal a column another header already claimed', () => {
    const shifted = [null, 'DATE', 'ARR', 'ORG', 'STA', 'RMA', 'DEP', 'DES', 'STD', 'RMD'];
    const map = buildHeaderMap(shifted);
    const used = Object.values(map.columns);
    expect(new Set(used).size, 'no column may be assigned twice').toBe(used.length);
  });
});

describe('row shapes', () => {
  it('emits an arrival only, when there is no departure', () => {
    const result = parseGrid(
      grid(block(MONDAY, [flight({ arr: 'IQ 365', org: 'AKTOBE', sta: '12:30', rma: 'DOM' })]))
    );
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].kind).toBe('arrival');
    expect(result.days[0]).toMatchObject({ arrivals: 1, departures: 0 });
  });

  it('emits a departure only, when there is no arrival', () => {
    const result = parseGrid(
      grid(block(MONDAY, [flight({ dep: 'IQ 366', des: 'AKTOBE', std: '13:00', rmd: 'DOM' })]))
    );
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].kind).toBe('departure');
  });

  it('keeps arrival and departure independent on one turnaround row', () => {
    const result = parseGrid(
      grid(
        block(MONDAY, [
          flight({
            arr: 'DV 762',
            org: 'AKTAU',
            sta: '09:00',
            rma: 'DOM',
            dep: 'DV 763',
            des: 'URALSK',
            std: '10:00',
            rmd: 'DOM',
          }),
        ])
      )
    );
    const [arrival, departure] = result.entries;
    expect(arrival.cityRaw).toBe('AKTAU');
    expect(departure.cityRaw).toBe('URALSK');
    expect(arrival.turnaroundKey).toBe(departure.turnaroundKey);
  });

  it('accepts a missing aircraft type', () => {
    const result = parseGrid(
      grid(block(MONDAY, [flight({ arr: 'IQ 365', org: 'AKTOBE', sta: '12:30', rma: 'DOM' })]))
    );
    expect(result.entries[0].aircraft).toBeNull();
    expect(errors(result.diagnostics)).toEqual([]);
  });

  it('records both halves when the same flight number repeats in a day', () => {
    const result = parseGrid(
      grid(
        block(MONDAY, [
          flight({ arr: 'IQ 365', org: 'AKTOBE', sta: '08:00', rma: 'DOM' }),
          flight({ arr: 'IQ 365', org: 'AKTOBE', sta: '18:00', rma: 'DOM' }),
        ])
      )
    );
    // A double daily rotation is legitimate; both must survive, distinguished
    // by time, which is why the DB key includes scheduledTime (plan §3.3).
    expect(result.entries).toHaveLength(2);
    expect(result.entries.map((e) => e.scheduledTime)).toEqual(['08:00', '18:00']);
  });
});

describe('separators and stray cells', () => {
  it('ends a block on a whitespace-only row', () => {
    const result = parseGrid(
      grid([
        ...block(MONDAY, [flight({ arr: 'IQ 365', org: 'AKTOBE', sta: '12:30', rma: 'DOM' })]),
        [null, null, null, null, null, null, null, null, null, null, ' '],
        ...block(45384, [flight({ arr: 'KC 7161', org: 'ALMATY', sta: '10:30', rma: 'DOM' })]),
      ])
    );
    expect(result.entries).toHaveLength(2);
    expect(result.days).toHaveLength(2);
  });

  it('ignores trailing junk rows after the last block', () => {
    const result = parseGrid(
      grid([
        ...block(MONDAY, [flight({ arr: 'IQ 365', org: 'AKTOBE', sta: '12:30', rma: 'DOM' })]),
        [],
        [null, ' '],
        [],
        [null, null, null, ' '],
      ])
    );
    expect(result.entries).toHaveLength(1);
    expect(errors(result.diagnostics)).toEqual([]);
  });

  it('tolerates a stray cell on the date row', () => {
    const rows = block(MONDAY, [
      flight({ arr: 'IQ 365', org: 'AKTOBE', sta: '12:30', rma: 'DOM' }),
    ]);
    rows[1] = [MONDAY, null, ' ']; // sample row 45 looks exactly like this
    const result = parseGrid(grid(rows));
    expect(result.days[0].date).toBe('2024-04-01');
    expect(errors(result.diagnostics)).toEqual([]);
  });
});

describe('times', () => {
  it('handles the 23:59 boundary and post-midnight rows in the same block', () => {
    const result = parseGrid(
      grid(
        block(MONDAY, [
          flight({ arr: 'A 1', org: 'ALMATY', sta: 1.3888888888888888e-2, rma: 'DOM' }),
          flight({ arr: 'A 2', org: 'ALMATY', sta: '23:59', rma: 'DOM' }),
        ])
      )
    );
    expect(result.entries.map((e) => e.scheduledTime)).toEqual(['00:20', '23:59']);
  });

  it('warns but keeps the flight when a time is missing', () => {
    const result = parseGrid(
      grid(block(MONDAY, [flight({ arr: 'IQ 365', org: 'AKTOBE', rma: 'DOM' })]))
    );
    expect(codes(warnings(result.diagnostics))).toContain(DIAGNOSTIC.MISSING_TIME);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].scheduledTime).toBeNull();
    expect(result.ok, 'a missing time must not block publishing').toBe(true);
  });

  it('warns and keeps the flight when a time is unreadable', () => {
    const result = parseGrid(
      grid(block(MONDAY, [flight({ arr: 'IQ 365', org: 'AKTOBE', sta: 'midday', rma: 'DOM' })]))
    );
    const warning = warnings(result.diagnostics).find((w) => w.code === DIAGNOSTIC.INVALID_TIME);
    expect(warning).toBeDefined();
    expect(warning!.row, 'must cite the real spreadsheet row').toBe(4);
    expect(warning!.message).toContain('midday');
  });
});

describe('classification', () => {
  it('warns on an unknown city but still publishes the flight', () => {
    const result = parseGrid(
      grid(block(MONDAY, [flight({ arr: 'XX 1', org: 'ATLANTIS', sta: '10:00', rma: 'DOM' })]))
    );
    expect(codes(warnings(result.diagnostics))).toContain(DIAGNOSTIC.UNKNOWN_CITY);
    expect(result.entries[0].cityRaw).toBe('ATLANTIS');
    expect(result.ok).toBe(true);
  });

  it('accepts a known city under an alias', () => {
    const result = parseGrid(
      grid(block(MONDAY, [flight({ arr: 'XX 1', org: 'NUR-SULTAN', sta: '10:00', rma: 'DOM' })]))
    );
    expect(codes(warnings(result.diagnostics))).not.toContain(DIAGNOSTIC.UNKNOWN_CITY);
  });

  it('warns when DOM/INT is neither', () => {
    const result = parseGrid(
      grid(block(MONDAY, [flight({ arr: 'XX 1', org: 'ALMATY', sta: '10:00', rma: 'MAYBE' })]))
    );
    expect(codes(warnings(result.diagnostics))).toContain(DIAGNOSTIC.UNKNOWN_DOM_INT);
    expect(result.entries[0].intl).toBeNull();
  });
});

describe('dates', () => {
  it('warns when the weekday label disagrees with the date, and trusts the date', () => {
    const rows = block(MONDAY, [flight({ arr: 'XX 1', org: 'ALMATY', sta: '10:00', rma: 'DOM' })]);
    rows[2] = ['FRIDAY']; // 2024-04-01 was a Monday
    const result = parseGrid(grid(rows));
    const warning = warnings(result.diagnostics).find(
      (w) => w.code === DIAGNOSTIC.WEEKDAY_MISMATCH
    );
    expect(warning).toBeDefined();
    expect(warning!.message).toContain('MONDAY');
    expect(result.days[0].date).toBe('2024-04-01');
  });

  it('errors on an unreadable date and cites the row', () => {
    const rows = block('not a date', [
      flight({ arr: 'XX 1', org: 'ALMATY', sta: '10:00', rma: 'DOM' }),
    ]);
    const result = parseGrid(grid(rows));
    const error = errors(result.diagnostics).find((e) => e.code === DIAGNOSTIC.UNPARSEABLE_DATE);
    expect(error).toBeDefined();
    expect(error!.row).toBe(2);
    expect(result.ok).toBe(false);
  });

  it('errors when the same date appears in two blocks', () => {
    const result = parseGrid(
      grid([
        ...block(MONDAY, [flight({ arr: 'XX 1', org: 'ALMATY', sta: '10:00', rma: 'DOM' })]),
        [],
        ...block(MONDAY, [flight({ arr: 'XX 2', org: 'ALMATY', sta: '11:00', rma: 'DOM' })]),
      ])
    );
    expect(codes(errors(result.diagnostics))).toContain(DIAGNOSTIC.DUPLICATE_DATE_BLOCK);
  });

  it('warns when the days are not consecutive', () => {
    const result = parseGrid(
      grid([
        ...block(MONDAY, [flight({ arr: 'XX 1', org: 'ALMATY', sta: '10:00', rma: 'DOM' })]),
        [],
        ...block(45390, [flight({ arr: 'XX 2', org: 'ALMATY', sta: '11:00', rma: 'DOM' })]),
      ])
    );
    expect(codes(warnings(result.diagnostics))).toContain(DIAGNOSTIC.NON_CONTIGUOUS_DATES);
    expect(result.ok, 'a gap is suspicious but not fatal').toBe(true);
  });
});

describe('whole-file failures', () => {
  it('errors when there are no DATE blocks', () => {
    const result = parseGrid(grid([['Some other spreadsheet'], ['a', 'b', 'c']]));
    expect(codes(errors(result.diagnostics))).toContain(DIAGNOSTIC.NO_DATE_BLOCKS);
    expect(result.ok).toBe(false);
  });

  it('errors on an entirely empty sheet', () => {
    const result = parseGrid(grid([]));
    expect(result.ok).toBe(false);
    expect(codes(errors(result.diagnostics))).toContain(DIAGNOSTIC.NO_DATE_BLOCKS);
  });

  it('errors when blocks exist but contain no flights', () => {
    const result = parseGrid(grid([HEADER, [MONDAY], ['MONDAY'], []]));
    expect(codes(errors(result.diagnostics))).toContain(DIAGNOSTIC.NO_ENTRIES);
  });

  it('rejects a 1904-date-system workbook rather than shifting every date', () => {
    const result = parseGrid({ ...grid([HEADER, [MONDAY], ['MONDAY']]), is1904: true });
    expect(codes(errors(result.diagnostics))).toContain(DIAGNOSTIC.DATE_1904);
    expect(result.ok).toBe(false);
  });
});

describe('upload path', () => {
  it('rejects a non-workbook renamed to .xlsx', () => {
    const result = parseScheduleWorkbook(Buffer.from('flight,city\nIQ365,AKTOBE\n', 'utf8'));
    expect(result.ok).toBe(false);
    expect(codes(result.diagnostics)).toContain(DIAGNOSTIC.NOT_A_WORKBOOK);
    expect(result.diagnostics[0].message).toMatch(/not a valid \.xlsx/i);
  });

  it('rejects an empty buffer', () => {
    const result = parseScheduleWorkbook(Buffer.alloc(0));
    expect(result.ok).toBe(false);
    expect(codes(result.diagnostics)).toContain(DIAGNOSTIC.NOT_A_WORKBOOK);
  });

  it('does not throw on random binary data', () => {
    const random = Buffer.from(Array.from({ length: 2048 }, (_, i) => (i * 37) % 251));
    expect(() => parseScheduleWorkbook(random)).not.toThrow();
    expect(parseScheduleWorkbook(random).ok).toBe(false);
  });

  it('reads a real workbook end to end and warns about extra sheets', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(
        block(MONDAY, [
          flight({
            arr: 'IQ 365',
            org: 'AKTOBE',
            sta: 0.52083333333333337,
            rma: 'DOM',
            dep: 'IQ 366',
            des: 'AKTOBE',
            std: '13:00',
            rmd: 'DOM',
            ac: 'Q400',
          }),
        ])
      ),
      'Week'
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['notes']]), 'Notes');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const result = parseScheduleWorkbook(buffer);

    expect(result.ok).toBe(true);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].scheduledTime).toBe('12:30');
    expect(result.entries[1].scheduledTime).toBe('13:00');
    expect(codes(warnings(result.diagnostics))).toContain(DIAGNOSTIC.MULTIPLE_SHEETS);
  });

  it('handles a large workbook without falling over', () => {
    const many = Array.from({ length: 4000 }, (_, i) =>
      flight({
        arr: `XX ${i}`,
        org: 'ALMATY',
        sta: 0.5,
        rma: 'DOM',
        dep: `YY ${i}`,
        des: 'ASTANA',
        std: 0.6,
        rmd: 'DOM',
      })
    );
    // The 200-row guard stops one runaway block from consuming the file.
    const result = parseGrid(grid(block(MONDAY, many)));
    expect(result.entries.length).toBeLessThanOrEqual(400);
    expect(result.ok).toBe(true);
  });
});
