import { describe, expect, it } from 'vitest';

import { BOARD_GRACE_MINUTES, expiresAt, hasSlipped, stillToCome } from '@/lib/flights/current';

const ALMATY = 'Asia/Almaty';

/**
 * Retiring flights that have gone.
 *
 * The property worth protecting is the *grace*, not the hiding: a flight must
 * survive its own scheduled minute and a quarter of an hour after it. Anything
 * that hides a flight the instant its clock ticks over sends someone who is
 * still in the queue to an empty board.
 */

describe('hasSlipped', () => {
  it('keeps a flight through its own minute and the whole grace period', () => {
    expect(hasSlipped('17:05', '17:04')).toBe(false);
    expect(hasSlipped('17:05', '17:05')).toBe(false);
    expect(hasSlipped('17:05', '17:19')).toBe(false);
  });

  it('retires it once the grace period is spent', () => {
    expect(hasSlipped('17:05', '17:20')).toBe(true);
    expect(hasSlipped('17:05', '23:59')).toBe(true);
  });

  it('is exactly fifteen minutes', () => {
    expect(BOARD_GRACE_MINUTES).toBe(15);
  });

  /*
   * A post-midnight arrival is printed under the day it lands on, so at 00:05
   * a 00:20 flight is still ahead — not fourteen hours behind. This is the case
   * a naive `scheduledTime < now` string comparison gets right by accident and
   * a naive minutes subtraction gets wrong.
   */
  it('treats the small hours as the start of the day, not the end', () => {
    expect(hasSlipped('00:20', '00:05')).toBe(false);
    expect(hasSlipped('00:00', '00:10')).toBe(false);
    expect(hasSlipped('00:00', '00:15')).toBe(true);
  });

  it('never retires a flight the workbook gave no time for', () => {
    expect(hasSlipped(null, '23:59')).toBe(false);
    expect(hasSlipped('', '23:59')).toBe(false);
    expect(hasSlipped('not a time', '23:59')).toBe(false);
    expect(hasSlipped('99:99', '23:59')).toBe(false);
  });

  it('does nothing when the clock itself is unreadable', () => {
    expect(hasSlipped('08:00', '')).toBe(false);
  });
});

describe('stillToCome', () => {
  const flights = [
    { flightNo: 'KC 7161', scheduledTime: '08:30' }, // long gone
    { flightNo: 'KC 7163', scheduledTime: '16:50' }, // grace spent at 17:05
    { flightNo: 'KC 7165', scheduledTime: '17:00' }, // gone, but still in grace
    { flightNo: 'FS 7162', scheduledTime: '17:40' }, // ahead
    { flightNo: 'IJ 0001', scheduledTime: null }, // no time in the workbook
  ];

  it('drops what has gone and keeps the order of the rest', () => {
    expect(stillToCome(flights, '17:09').map((f) => f.flightNo)).toEqual([
      'KC 7165',
      'FS 7162',
      'IJ 0001',
    ]);
  });

  it('returns an empty list rather than the whole day once everything has gone', () => {
    expect(stillToCome([flights[0], flights[1]], '23:00')).toEqual([]);
  });

  it('touches nothing at the start of the day', () => {
    expect(stillToCome(flights, '00:01')).toHaveLength(5);
  });
});

describe('expiresAt', () => {
  it('resolves the airport wall clock to a real instant, grace included', () => {
    // 17:05 Almaty on 2026-08-15 is 12:05Z; the row dies fifteen minutes later.
    expect(expiresAt('2026-08-15', '17:05', ALMATY)).toBe(Date.parse('2026-08-15T12:20:00Z'));
  });

  it('is null for a flight with no time, so no attribute is ever written', () => {
    expect(expiresAt('2026-08-15', null, ALMATY)).toBeNull();
  });

  /*
   * The whole reason this returns an instant rather than a string: the browser
   * comparing it against `Date.now()` must reach the same verdict wherever the
   * reader is sitting.
   */
  it('does not depend on the reader being in Kazakhstan', () => {
    const almaty = expiresAt('2026-08-15', '17:05', ALMATY);
    const istanbul = expiresAt('2026-08-15', '17:05', 'Europe/Istanbul');
    expect(almaty).not.toBe(istanbul);
    expect(istanbul! - almaty!).toBe(2 * 60 * 60 * 1000);
  });
});
