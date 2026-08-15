import { describe, expect, it } from 'vitest';

import { applyEdits, type FlightEdit } from '@/lib/flights/overlay';
import type { BoardFlight } from '@/lib/flights/types';

/**
 * Laying staff corrections over the uploaded workbook.
 *
 * The properties worth protecting are the ones that fail silently if they
 * break: an edit that stops finding its flight, a flight that appears twice,
 * a NULL column that erases a real value.
 */

function flight(over: Partial<BoardFlight> = {}): BoardFlight {
  return {
    id: 'row-1',
    kind: 'departure',
    date: '2026-08-15',
    flightNo: 'DV 761',
    flightNoNorm: 'DV761',
    cityRaw: 'AKTAU',
    cityKey: 'AKTAU',
    scheduledTime: '17:40',
    intl: false,
    aircraft: 'CRJ200',
    actualTime: null,
    note: null,
    ...over,
  };
}

function edit(over: Partial<FlightEdit> = {}): FlightEdit {
  return {
    id: 'edit-1',
    date: '2026-08-15',
    kind: 'departure',
    flightNoNorm: 'DV761',
    isAdded: false,
    isRemoved: false,
    flightNo: null,
    cityRaw: null,
    cityKey: null,
    scheduledTime: null,
    intl: null,
    aircraft: null,
    actualTime: null,
    note: null,
    ...over,
  };
}

describe('applyEdits', () => {
  it('returns the rows untouched when there is nothing to apply', () => {
    const rows = [flight()];
    expect(applyEdits(rows, [])).toBe(rows);
  });

  /*
   * The single most important property here. A NULL override column means
   * "staff never touched this", not "staff cleared it" — get this backwards and
   * saving an actual time wipes the city, the aircraft and the flight number of
   * every flight it touches.
   */
  it('leaves every field a NULL override does not mention', () => {
    const merged = applyEdits([flight()], [edit({ actualTime: '17:52' })]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      flightNo: 'DV 761',
      cityRaw: 'AKTAU',
      cityKey: 'AKTAU',
      scheduledTime: '17:40',
      intl: false,
      aircraft: 'CRJ200',
      actualTime: '17:52',
    });
  });

  it('applies the columns an override does fill', () => {
    const merged = applyEdits(
      [flight()],
      [edit({ cityRaw: 'ALMATY', cityKey: 'ALMATY', aircraft: 'E190', note: 'смена борта' })]
    );

    expect(merged[0]).toMatchObject({
      cityRaw: 'ALMATY',
      cityKey: 'ALMATY',
      aircraft: 'E190',
      note: 'смена борта',
      flightNo: 'DV 761',
    });
  });

  // `false` is a value and `null` is silence; `||` would confuse the two and
  // quietly promote every domestic flight to international.
  it('can override a boolean to false', () => {
    const merged = applyEdits([flight({ intl: true })], [edit({ intl: false })]);
    expect(merged[0].intl).toBe(false);
  });

  it('drops a tombstoned flight', () => {
    expect(applyEdits([flight()], [edit({ isRemoved: true })])).toEqual([]);
  });

  it('appends a flight nobody uploaded', () => {
    const added = edit({
      id: 'edit-2',
      isAdded: true,
      flightNoNorm: 'KC999',
      flightNo: 'KC 999',
      cityRaw: 'ASTANA',
      cityKey: 'ASTANA',
      scheduledTime: '20:00',
    });

    const merged = applyEdits([flight()], [added]);

    expect(merged.map((f) => f.flightNoNorm)).toEqual(['DV761', 'KC999']);
    // Prefixed, because there is no flight_entries row behind it and the
    // calendar export has to know which table to read.
    expect(merged[1].id).toBe('edit:edit-2');
  });

  /*
   * The duplicate case. Staff add a flight in one week; the airport puts the
   * same flight in the next workbook. The edit is now an override, not an
   * addition, and emitting it as both would show the flight twice.
   */
  it('does not show an added flight twice once the workbook catches up', () => {
    const added = edit({ isAdded: true, scheduledTime: '18:10' });
    const merged = applyEdits([flight()], [added]);

    expect(merged).toHaveLength(1);
    expect(merged[0].scheduledTime).toBe('18:10');
    expect(merged[0].id).toBe('row-1');
  });

  it('re-sorts after an edited time moves a flight', () => {
    const rows = [
      flight({ id: 'a', flightNoNorm: 'KC1', flightNo: 'KC 1', scheduledTime: '08:00' }),
      flight({ id: 'b', flightNoNorm: 'KC2', flightNo: 'KC 2', scheduledTime: '12:00' }),
      flight({ id: 'c', flightNoNorm: 'KC3', flightNo: 'KC 3', scheduledTime: '16:00' }),
    ];

    const merged = applyEdits(rows, [edit({ flightNoNorm: 'KC3', scheduledTime: '06:00' })]);
    expect(merged.map((f) => f.id)).toEqual(['c', 'a', 'b']);
  });

  // SQLite sorts NULL first ascending, and the board relied on that before the
  // overlay existed. A flight with no published time must not be shunted to the
  // bottom of the day by a comparator that treats null as a large string.
  it('keeps a flight with no time at the top of its day', () => {
    const rows = [
      flight({ id: 'timed', flightNoNorm: 'KC1', scheduledTime: '08:00' }),
      flight({ id: 'untimed', flightNoNorm: 'KC2', scheduledTime: null }),
    ];

    const merged = applyEdits(rows, [edit({ flightNoNorm: 'KC1', note: 'x' })]);
    expect(merged.map((f) => f.id)).toEqual(['untimed', 'timed']);
  });

  it('keeps days in order across a range', () => {
    const rows = [
      flight({ id: 'mon', date: '2026-08-10', flightNoNorm: 'KC1', scheduledTime: '18:00' }),
      flight({ id: 'tue', date: '2026-08-11', flightNoNorm: 'KC2', scheduledTime: '06:00' }),
    ];

    const merged = applyEdits(rows, [edit({ date: '2026-08-10', flightNoNorm: 'KC1', note: 'x' })]);
    expect(merged.map((f) => f.id)).toEqual(['mon', 'tue']);
  });

  it('does not confuse an arrival with a departure of the same number', () => {
    const rows = [
      flight({ id: 'arr', kind: 'arrival', flightNoNorm: 'DV761' }),
      flight({ id: 'dep', kind: 'departure', flightNoNorm: 'DV761' }),
    ];

    const merged = applyEdits(rows, [edit({ kind: 'arrival', actualTime: '09:00' })]);

    expect(merged.find((f) => f.id === 'arr')?.actualTime).toBe('09:00');
    expect(merged.find((f) => f.id === 'dep')?.actualTime).toBeNull();
  });

  it('ignores an edit for a day the board is not showing', () => {
    const merged = applyEdits([flight()], [edit({ date: '2026-09-01', actualTime: '10:00' })]);
    expect(merged).toHaveLength(1);
    expect(merged[0].actualTime).toBeNull();
  });

  // A tombstone on an added flight is the "added by mistake" case: it must not
  // come back as an addition on the way past the second loop.
  it('does not resurrect an added flight that was then removed', () => {
    const merged = applyEdits(
      [],
      [edit({ isAdded: true, isRemoved: true, flightNoNorm: 'KC999' })]
    );
    expect(merged).toEqual([]);
  });
});
