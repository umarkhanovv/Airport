import { describe, expect, it } from 'vitest';

import { addDays, airportNowTime, airportToday, formatLongDate, formatWeekday } from '@/lib/date';

/**
 * "Today" must be the airport's today, not the server's (plan §4 rule 2).
 *
 * The airport will run its server in UTC. Almaty is UTC+5, so between 19:00
 * and midnight UTC the two calendars disagree — and a board that used the
 * server's date would spend every evening showing tomorrow's flights.
 *
 * These tests pin the boundary explicitly with a fixed instant, so they prove
 * the rule rather than merely passing on whatever machine runs them.
 */

const ALMATY = 'Asia/Almaty';

describe('airportToday', () => {
  it('is already tomorrow in Almaty while it is still today in UTC', () => {
    // 2024-04-01 19:30 UTC === 2024-04-02 00:30 in Almaty.
    const instant = new Date('2024-04-01T19:30:00Z');

    expect(airportToday(ALMATY, instant)).toBe('2024-04-02');
    expect(airportToday('UTC', instant)).toBe('2024-04-01');
    // The naive version everyone reaches for, and why it is banned:
    expect(instant.toISOString().slice(0, 10)).toBe('2024-04-01');
  });

  it('agrees with UTC during the rest of the day', () => {
    const instant = new Date('2024-04-01T09:00:00Z');
    expect(airportToday(ALMATY, instant)).toBe('2024-04-01');
    expect(airportToday('UTC', instant)).toBe('2024-04-01');
  });

  it('handles the exact rollover instant', () => {
    // 19:00:00Z is precisely midnight in Almaty.
    expect(airportToday(ALMATY, new Date('2024-04-01T18:59:59Z'))).toBe('2024-04-01');
    expect(airportToday(ALMATY, new Date('2024-04-01T19:00:00Z'))).toBe('2024-04-02');
  });

  it('rolls over month and year boundaries correctly', () => {
    expect(airportToday(ALMATY, new Date('2024-01-31T19:30:00Z'))).toBe('2024-02-01');
    expect(airportToday(ALMATY, new Date('2024-12-31T19:30:00Z'))).toBe('2025-01-01');
    // 2024 is a leap year; 2023 is not.
    expect(airportToday(ALMATY, new Date('2024-02-28T19:30:00Z'))).toBe('2024-02-29');
    expect(airportToday(ALMATY, new Date('2023-02-28T19:30:00Z'))).toBe('2023-03-01');
  });

  it('always produces a YYYY-MM-DD string', () => {
    expect(airportToday(ALMATY, new Date('2024-04-01T00:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('airportNowTime', () => {
  it('reports Almaty wall-clock time, not UTC', () => {
    const instant = new Date('2024-04-01T07:30:00Z');
    expect(airportNowTime(ALMATY, instant)).toBe('12:30');
    expect(airportNowTime('UTC', instant)).toBe('07:30');
  });

  it('uses 24-hour time, zero-padded, so it sorts against scheduledTime', () => {
    // The board compares this string directly against stored HH:MM values.
    expect(airportNowTime(ALMATY, new Date('2024-04-01T00:30:00Z'))).toBe('05:30');
    expect(airportNowTime(ALMATY, new Date('2024-04-01T19:30:00Z'))).toBe('00:30');
    expect(airportNowTime(ALMATY, new Date('2024-04-01T07:05:00Z'))).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('addDays', () => {
  it('shifts dates without touching timezones', () => {
    expect(addDays('2024-04-01', 6)).toBe('2024-04-07');
    expect(addDays('2024-04-07', -6)).toBe('2024-04-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
    expect(addDays('2024-04-01', 0)).toBe('2024-04-01');
  });
});

describe('localised formatting', () => {
  it('formats the same date per locale', () => {
    expect(formatLongDate('2024-04-07', 'en')).toBe('7 April 2024');
    expect(formatLongDate('2024-04-07', 'ru')).toContain('апрел');
    expect(formatLongDate('2024-04-07', 'kk')).toContain('сәуір');
  });

  it('names weekdays correctly', () => {
    // 2024-04-01 was a Monday.
    expect(formatWeekday('2024-04-01', 'en')).toBe('Monday');
    expect(formatWeekday('2024-04-01', 'ru')).toBe('понедельник');
  });

  it('does not shift the date when formatting near midnight', () => {
    // A naive `new Date('2024-04-07')` in a negative-offset zone renders the
    // 6th. Formatting is pinned to UTC to stop that.
    expect(formatLongDate('2024-04-07', 'en')).toContain('7');
    expect(formatLongDate('2024-04-01', 'en')).toContain('1');
  });
});
