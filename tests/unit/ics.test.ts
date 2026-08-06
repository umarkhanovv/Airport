import { describe, expect, it } from 'vitest';

import { buildFlightIcs, type IcsFlight } from '@/lib/flights/ics';
import { zonedWallClockToUtc } from '@/lib/date';

/**
 * Calendar export (§17.3).
 *
 * The interesting part is the timezone conversion: the board stores wall-clock
 * strings on purpose, and this is the one place they become real instants. Get
 * it wrong and someone's phone reminds them five hours late.
 */

const ALMATY = 'Asia/Almaty';

const flight: IcsFlight = {
  kind: 'arrival',
  date: '2024-04-06',
  scheduledTime: '00:20',
  flightNo: 'KC 7361',
  city: 'Астана',
  airportName: 'Международный аэропорт Туркестан',
  directionLabel: 'Прилёт',
  scheduledNote: 'время по расписанию',
  url: 'https://hsairport.kz/flights',
};

describe('zonedWallClockToUtc', () => {
  it('converts an Almaty wall clock to the correct instant', () => {
    // Almaty is UTC+5, so 00:20 local on the 6th is 19:20 UTC on the 5th.
    expect(zonedWallClockToUtc('2024-04-06', '00:20', ALMATY).toISOString()).toBe(
      '2024-04-05T19:20:00.000Z'
    );
    expect(zonedWallClockToUtc('2024-04-06', '12:30', ALMATY).toISOString()).toBe(
      '2024-04-06T07:30:00.000Z'
    );
  });

  it('is identity for UTC', () => {
    expect(zonedWallClockToUtc('2024-04-06', '12:30', 'UTC').toISOString()).toBe(
      '2024-04-06T12:30:00.000Z'
    );
  });

  it('handles a zone that observes DST, on both sides of a transition', () => {
    // Europe/London: GMT in January, BST in July.
    expect(zonedWallClockToUtc('2024-01-15', '12:00', 'Europe/London').toISOString()).toBe(
      '2024-01-15T12:00:00.000Z'
    );
    expect(zonedWallClockToUtc('2024-07-15', '12:00', 'Europe/London').toISOString()).toBe(
      '2024-07-15T11:00:00.000Z'
    );
  });

  it('handles a negative offset', () => {
    expect(zonedWallClockToUtc('2024-01-15', '12:00', 'America/New_York').toISOString()).toBe(
      '2024-01-15T17:00:00.000Z'
    );
  });

  it('does not depend on the machine running it', () => {
    // Explicit about the property that matters: same input, same instant,
    // whatever TZ the developer or CI happens to be in.
    const value = zonedWallClockToUtc('2024-04-06', '00:20', ALMATY).getTime();
    expect(value).toBe(Date.UTC(2024, 3, 5, 19, 20));
  });
});

describe('buildFlightIcs', () => {
  const ics = buildFlightIcs(flight, ALMATY, new Date('2026-08-06T00:00:00Z'));

  it('produces a well-formed calendar', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('VERSION:2.0');
  });

  it('uses CRLF line endings throughout, as the format requires', () => {
    const bareNewlines = ics.split('\n').filter((line, i, all) => {
      const isLast = i === all.length - 1;
      return !isLast && !line.endsWith('\r');
    });
    expect(bareNewlines).toEqual([]);
  });

  it('writes the converted instant, not the wall clock', () => {
    expect(ics).toContain('DTSTART:20240405T192000Z');
    expect(ics).toContain('DTEND:20240405T202000Z');
    // The naive reading would be this, and it would be five hours wrong.
    expect(ics).not.toContain('DTSTART:20240406T002000Z');
  });

  it('gives each flight a stable UID so re-importing updates rather than duplicates', () => {
    const again = buildFlightIcs(flight, ALMATY, new Date('2027-01-01T00:00:00Z'));
    const uid = (text: string) => text.match(/UID:(.+)/)?.[1];
    expect(uid(ics)).toBe(uid(again));
    expect(uid(ics)).toContain('2024-04-06-arrival-KC7361');
  });

  it('escapes characters that would otherwise break the format', () => {
    const risky = buildFlightIcs(
      { ...flight, city: 'Алматы, Казахстан; сектор A\\B' },
      ALMATY,
      new Date('2026-08-06T00:00:00Z')
    );
    expect(risky).toContain('\\,');
    expect(risky).toContain('\\;');
    expect(risky).toContain('\\\\');
  });

  it('folds long lines to 75 octets, counting bytes not characters', () => {
    // Cyrillic is two bytes per character, so a character-based fold would
    // produce over-long lines here.
    const longCity = 'Международный аэропорт имени Ходжи Ахмеда Ясави в городе Туркестан';
    const folded = buildFlightIcs({ ...flight, city: longCity }, ALMATY);
    const encoder = new TextEncoder();

    for (const line of folded.split('\r\n')) {
      expect(encoder.encode(line).length, `line too long: ${line}`).toBeLessThanOrEqual(75);
    }
  });

  it('keeps folded content recoverable by unfolding', () => {
    const longCity = 'Международный аэропорт имени Ходжи Ахмеда Ясави в городе Туркестан';
    const folded = buildFlightIcs({ ...flight, city: longCity }, ALMATY);
    // Unfolding is removing CRLF followed by a single space.
    const unfolded = folded.replace(/\r\n /g, '');
    expect(unfolded).toContain(longCity);
  });

  it('states that the time is scheduled and invents nothing else', () => {
    expect(ics).toContain('KC 7361');
    expect(ics).toContain('Астана');
    expect(ics.toLowerCase()).not.toMatch(/регистрац|check-?in|прибыл|задерж/);
  });
});
