import { describe, expect, it } from 'vitest';

import {
  isBlankRow,
  normalizeCity,
  normalizeFlightNo,
  normalizeIntl,
  normalizeTime,
  parseFlightDate,
  weekdayName,
} from '@/lib/flights/normalize';

describe('normalizeTime — Excel day fractions', () => {
  /**
   * Every distinct time serial in the sample workbook, with the value the file
   * means. Three of these are wrong under truncation (plan §1.1b) and are
   * marked; they are the reason `Math.round` is mandatory.
   */
  const SERIALS: Array<[number, string, string?]> = [
    [0.31944444444444448, '07:40'],
    [0.37152777777777773, '08:55', 'truncation gives 08:54'],
    [0.3923611111111111, '09:25'],
    [0.40625, '09:45'],
    [0.41319444444444442, '09:55'],
    [0.41666666666666669, '10:00'],
    [0.4201388888888889, '10:05'],
    [0.42708333333333331, '10:15'],
    [0.4375, '10:30'],
    [0.44791666666666669, '10:45'],
    [0.45833333333333331, '11:00'],
    [0.46527777777777773, '11:10', 'truncation gives 11:09'],
    [0.46875, '11:15'],
    [0.4861111111111111, '11:40'],
    [0.50694444444444442, '12:10'],
    [0.52083333333333337, '12:30'],
    [0.55555555555555558, '13:20'],
    [0.57986111111111105, '13:55', 'truncation gives 13:54'],
    [0.67361111111111116, '16:10'],
    [0.69444444444444453, '16:40'],
    [0.70833333333333337, '17:00'],
    [0.73611111111111116, '17:40'],
    [1.3888888888888888e-2, '00:20'],
    [3.4722222222222224e-2, '00:50'],
  ];

  it.each(SERIALS)('%f → %s %s', (serial, expected) => {
    expect(normalizeTime(serial)).toEqual({ kind: 'time', value: expected });
  });

  it('rounds rather than truncates', () => {
    // The three sample values that expose the difference.
    for (const [serial, expected] of [
      [0.57986111111111105, '13:55'],
      [0.37152777777777773, '08:55'],
      [0.46527777777777773, '11:10'],
    ] as const) {
      const truncated = Math.floor((serial % 1) * 1440);
      const rounded = Math.round((serial % 1) * 1440);
      expect(rounded, 'the fixture should actually differ').not.toBe(truncated);
      expect(normalizeTime(serial)).toEqual({ kind: 'time', value: expected });
    }
  });

  it('takes only the time-of-day from a full datetime serial', () => {
    expect(normalizeTime(45383.52083333333)).toEqual({ kind: 'time', value: '12:30' });
  });

  it('handles both ends of the day', () => {
    expect(normalizeTime(0)).toEqual({ kind: 'time', value: '00:00' });
    expect(normalizeTime(1439 / 1440)).toEqual({ kind: 'time', value: '23:59' });
  });

  it('clamps a value that rounds up to 24:00', () => {
    expect(normalizeTime(0.99999999)).toEqual({ kind: 'clamped', value: '00:00' });
  });

  it('rejects negative and non-finite values', () => {
    expect(normalizeTime(-0.5).kind).toBe('invalid');
    expect(normalizeTime(Number.NaN).kind).toBe('invalid');
    expect(normalizeTime(Number.POSITIVE_INFINITY).kind).toBe('invalid');
  });
});

describe('normalizeTime — text cells', () => {
  it('accepts HH:MM and H:MM', () => {
    expect(normalizeTime('13:00')).toEqual({ kind: 'time', value: '13:00' });
    expect(normalizeTime('09:00')).toEqual({ kind: 'time', value: '09:00' });
    expect(normalizeTime('9:05')).toEqual({ kind: 'time', value: '09:05' });
  });

  it('accepts HH:MM:SS, discarding seconds', () => {
    expect(normalizeTime('12:30:00')).toEqual({ kind: 'time', value: '12:30' });
    expect(normalizeTime('23:59:59')).toEqual({ kind: 'time', value: '23:59' });
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeTime('  16:25  ')).toEqual({ kind: 'time', value: '16:25' });
  });

  it('treats blank and whitespace-only as empty, not invalid', () => {
    expect(normalizeTime('')).toEqual({ kind: 'empty' });
    expect(normalizeTime('   ')).toEqual({ kind: 'empty' });
    expect(normalizeTime(null)).toEqual({ kind: 'empty' });
    expect(normalizeTime(undefined)).toEqual({ kind: 'empty' });
  });

  it('rejects out-of-range and malformed times', () => {
    expect(normalizeTime('25:00').kind).toBe('invalid');
    expect(normalizeTime('12:75').kind).toBe('invalid');
    expect(normalizeTime('midday').kind).toBe('invalid');
    expect(normalizeTime('12-30').kind).toBe('invalid');
  });
});

describe('parseFlightDate', () => {
  it('reads the sample workbook serials', () => {
    expect(parseFlightDate(45383)).toEqual({ kind: 'date', value: '2024-04-01' });
    expect(parseFlightDate(45389)).toEqual({ kind: 'date', value: '2024-04-07' });
  });

  it('ignores the time portion of a datetime serial', () => {
    expect(parseFlightDate(45383.9999)).toEqual({ kind: 'date', value: '2024-04-01' });
  });

  it('reads day-first text dates, as the file itself writes them', () => {
    expect(parseFlightDate('01.04.2024')).toEqual({ kind: 'date', value: '2024-04-01' });
    expect(parseFlightDate('7.04.2024')).toEqual({ kind: 'date', value: '2024-04-07' });
    expect(parseFlightDate('01/04/2024')).toEqual({ kind: 'date', value: '2024-04-01' });
    expect(parseFlightDate('01.04.24')).toEqual({ kind: 'date', value: '2024-04-01' });
  });

  it('reads ISO dates', () => {
    expect(parseFlightDate('2024-04-01')).toEqual({ kind: 'date', value: '2024-04-01' });
  });

  it('rejects the 1900 leap-year bug window rather than guessing', () => {
    // Serials 1–60 straddle Excel's non-existent 29 Feb 1900. A flight
    // schedule is never dated 1900, so this is a parse error, not a date.
    expect(parseFlightDate(1).kind).toBe('invalid');
    expect(parseFlightDate(60).kind).toBe('invalid');
    expect(parseFlightDate(61).kind).toBe('date');
  });

  it('rejects impossible calendar dates instead of rolling them over', () => {
    expect(parseFlightDate('31.02.2024').kind).toBe('invalid');
    expect(parseFlightDate('32.01.2024').kind).toBe('invalid');
    expect(parseFlightDate('01.13.2024').kind).toBe('invalid');
  });

  it('rejects weekday names — the trap that motivates type-based branching', () => {
    // These cells carry an mm-dd-yy number format while holding a string.
    expect(parseFlightDate('TUESDAY').kind).toBe('invalid');
    expect(parseFlightDate('MONDAY').kind).toBe('invalid');
  });

  it('rejects blanks', () => {
    expect(parseFlightDate(null).kind).toBe('invalid');
    expect(parseFlightDate('   ').kind).toBe('invalid');
  });
});

describe('weekdayName', () => {
  it('matches the weekday labels printed in the sample', () => {
    expect(weekdayName('2024-04-01')).toBe('MONDAY');
    expect(weekdayName('2024-04-06')).toBe('SATURDAY');
    expect(weekdayName('2024-04-07')).toBe('SUNDAY');
  });
});

describe('normalizeFlightNo', () => {
  it('keeps the printed form and derives a whitespace-free key', () => {
    expect(normalizeFlightNo('KC 7163')).toEqual({ display: 'KC 7163', norm: 'KC7163' });
    expect(normalizeFlightNo('5W7201')).toEqual({ display: '5W7201', norm: '5W7201' });
  });

  it('collapses irregular whitespace and uppercases the key', () => {
    expect(normalizeFlightNo('  kc   7163 ')).toEqual({ display: 'kc 7163', norm: 'KC7163' });
  });

  it('returns null for blanks', () => {
    expect(normalizeFlightNo('')).toBeNull();
    expect(normalizeFlightNo('   ')).toBeNull();
    expect(normalizeFlightNo(null)).toBeNull();
  });
});

describe('normalizeCity', () => {
  it('preserves the printed name and uppercases the key', () => {
    expect(normalizeCity('ABU DHABI')).toEqual({ raw: 'ABU DHABI', key: 'ABU DHABI' });
    expect(normalizeCity('  Abu   Dhabi ')).toEqual({ raw: 'Abu Dhabi', key: 'ABU DHABI' });
  });

  it('returns null for blanks', () => {
    expect(normalizeCity('   ')).toBeNull();
    expect(normalizeCity(null)).toBeNull();
  });
});

describe('normalizeIntl', () => {
  it('maps DOM and INT', () => {
    expect(normalizeIntl('INT')).toBe(true);
    expect(normalizeIntl('DOM')).toBe(false);
    expect(normalizeIntl(' int ')).toBe(true);
  });

  it('returns null rather than guessing', () => {
    // A flight wrongly labelled domestic would send passengers to the wrong
    // part of the terminal, so anything unrecognised stays unknown.
    expect(normalizeIntl('')).toBeNull();
    expect(normalizeIntl('D')).toBeNull();
    expect(normalizeIntl('INTERNATIONAL')).toBeNull();
    expect(normalizeIntl(null)).toBeNull();
  });
});

describe('isBlankRow', () => {
  it('treats whitespace-only rows as blank', () => {
    // The sample's Saturday/Sunday separator is a row containing a single
    // space in column K (plan §1.1d).
    expect(isBlankRow([null, null, ' ', null])).toBe(true);
    expect(isBlankRow([])).toBe(true);
    expect(isBlankRow(undefined)).toBe(true);
    expect(isBlankRow([null, 'IQ 365'])).toBe(false);
  });
});
