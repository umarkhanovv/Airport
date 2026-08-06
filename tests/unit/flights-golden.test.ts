import fs from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { DIAGNOSTIC, parseScheduleWorkbook, type ParseResult } from '@/lib/flights';

/**
 * The golden fixture (plan §5.6).
 *
 * `data/sample_weekly_schedule.xlsx` is the real file the airport produces.
 * Every quirk it contains is a defect this parser must survive, so its exact
 * output is pinned here. If this test fails, either the parser regressed or
 * the airport changed the file format — and both need a human.
 */

const FIXTURE = path.resolve(__dirname, '../fixtures/sample_weekly_schedule.xlsx');

let result: ParseResult;

beforeAll(() => {
  result = parseScheduleWorkbook(fs.readFileSync(FIXTURE));
});

/** Finds exactly one entry, failing loudly with context if not. */
function one(kind: 'arrival' | 'departure', date: string, flightNoNorm: string) {
  const matches = result.entries.filter(
    (e) => e.kind === kind && e.date === date && e.flightNoNorm === flightNoNorm
  );
  expect(matches, `expected exactly one ${kind} ${flightNoNorm} on ${date}`).toHaveLength(1);
  return matches[0];
}

describe('totals', () => {
  it('parses without errors', () => {
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors, JSON.stringify(errors, null, 2)).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('produces exactly 38 entries — not 40, not 36', () => {
    // 40 would mean the stray-whitespace rows were treated as flights;
    // 36 would mean a real row was swallowed as a separator (plan §1.1d).
    expect(result.entries).toHaveLength(38);
  });

  it('finds 7 day blocks spanning the advertised week', () => {
    expect(result.days).toHaveLength(7);
    expect(result.weekStart).toBe('2024-04-01');
    expect(result.weekEnd).toBe('2024-04-07');
  });

  it('splits into 19 turnarounds', () => {
    expect(new Set(result.entries.map((e) => e.turnaroundKey)).size).toBe(19);
  });

  it('raises exactly one warning: the blank RMD header', () => {
    const warnings = result.diagnostics.filter((d) => d.severity === 'warning');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe(DIAGNOSTIC.HEADER_ASSUMED);
    // It must cite the real spreadsheet row, which is row 2.
    expect(warnings[0].row).toBe(2);
    expect(warnings[0].message).toContain('RMD');
    expect(warnings[0].message).toContain('column L');
  });

  it('matches the per-day arrival/departure counts', () => {
    expect(result.days.map((d) => [d.date, d.arrivals, d.departures])).toEqual([
      ['2024-04-01', 2, 2],
      ['2024-04-02', 1, 1],
      ['2024-04-03', 5, 5],
      ['2024-04-04', 2, 2],
      ['2024-04-05', 2, 2],
      ['2024-04-06', 6, 6],
      ['2024-04-07', 1, 1],
    ]);
  });
});

describe('spot-checks — each guards one specific quirk', () => {
  it('Monday departures keep DOM despite the blank RMD header', () => {
    // The header cell at column L is a single space, not the string "RMD".
    // Without the positional fallback this comes back null (plan §1.1a).
    const flight = one('departure', '2024-04-01', 'IQ366');
    expect(flight.intl).toBe(false);
    expect(flight.cityRaw).toBe('AKTOBE');
    expect(flight.scheduledTime).toBe('13:00');
  });

  it('5W7202 departs at 13:55, not 13:54 (serial rounding)', () => {
    // 0.57986111111111105 × 1440 = 834.9999999999999
    expect(one('departure', '2024-04-02', '5W7202').scheduledTime).toBe('13:55');
  });

  it('TK 257 departs at 08:55, not 08:54 (serial rounding)', () => {
    const flight = one('departure', '2024-04-06', 'TK257');
    expect(flight.scheduledTime).toBe('08:55');
    expect(flight.intl).toBe(true);
    expect(flight.cityRaw).toBe('ISTANBUL');
  });

  it('DV 763 departs at 11:10, not 11:09 (serial rounding)', () => {
    expect(one('departure', '2024-04-06', 'DV763').scheduledTime).toBe('11:10');
  });

  it('the departure city is not copied from the arrival city', () => {
    // Same turnaround row: arrives from AKTAU, departs to URALSK (plan §1.1e).
    const arrival = one('arrival', '2024-04-03', 'DV762');
    const departure = one('departure', '2024-04-03', 'DV763');
    expect(arrival.cityRaw).toBe('AKTAU');
    expect(departure.cityRaw).toBe('URALSK');
    expect(departure.turnaroundKey).toBe(arrival.turnaroundKey);
  });

  it('handles the post-midnight arrival and departure', () => {
    const arrival = one('arrival', '2024-04-06', 'KC7361');
    const departure = one('departure', '2024-04-06', 'KC7362');
    expect(arrival.scheduledTime).toBe('00:20');
    expect(departure.scheduledTime).toBe('00:50');
    expect(arrival.cityRaw).toBe('ASTANA');
  });

  it('sorts the post-midnight arrival first on its day', () => {
    const saturdayArrivals = result.entries
      .filter((e) => e.date === '2024-04-06' && e.kind === 'arrival')
      .sort((a, b) => (a.scheduledTime ?? '').localeCompare(b.scheduledTime ?? ''));

    expect(saturdayArrivals[0].flightNoNorm).toBe('KC7361');
    expect(saturdayArrivals[0].scheduledTime).toBe('00:20');
  });

  it('reads text-formatted times identically to numeric ones', () => {
    // '09:00' is stored as text; the surrounding cells are day fractions.
    expect(one('arrival', '2024-04-03', 'DV762').scheduledTime).toBe('09:00');
    expect(one('departure', '2024-04-01', 'IQ366').scheduledTime).toBe('13:00');
    expect(one('arrival', '2024-04-06', 'DV764').scheduledTime).toBe('16:25');
  });

  it('normalises flight numbers regardless of internal spacing', () => {
    // The file mixes 'KC 7163' and '5W7201'.
    expect(one('arrival', '2024-04-07', 'KC7163').flightNo).toBe('KC 7163');
    expect(one('arrival', '2024-04-02', '5W7201').flightNo).toBe('5W7201');
  });
});

describe('data quality across the whole file', () => {
  it('gives every entry a time, a city and a DOM/INT flag', () => {
    for (const entry of result.entries) {
      expect(entry.scheduledTime, `${entry.date} ${entry.flightNo}`).toMatch(/^\d{2}:\d{2}$/);
      expect(entry.cityRaw, `${entry.date} ${entry.flightNo}`).not.toBe('');
      expect(entry.intl, `${entry.date} ${entry.flightNo}`).not.toBeNull();
    }
  });

  it('recognises every city in the file', () => {
    expect(new Set(result.entries.map((e) => e.cityRaw))).toEqual(
      new Set([
        'ALMATY',
        'ASTANA',
        'AKTAU',
        'AKTOBE',
        'KOSTANAY',
        'URALSK',
        'ISTANBUL',
        'ABU DHABI',
      ])
    );
  });

  it('carries the aircraft type through', () => {
    expect(new Set(result.entries.map((e) => e.aircraft))).toEqual(
      new Set(['Q400', 'A320', 'A321', 'CRJ200', 'B737-8'])
    );
  });

  it('cites a plausible source row for every entry', () => {
    for (const entry of result.entries) {
      expect(entry.sourceRow).toBeGreaterThan(2);
      expect(entry.sourceRow).toBeLessThanOrEqual(47);
    }
  });

  it('never stores a timestamp, only a wall-clock string', () => {
    // Guards plain §4 rule 1: a Date here would shift the board by 5 hours.
    for (const entry of result.entries) {
      expect(typeof entry.scheduledTime).toBe('string');
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
