import { describe, expect, it } from 'vitest';

import { airlineForFlightNo, airlineLogoSrc, airlineName } from '@/lib/flights/airlines';

/**
 * Attributing a flight to a carrier.
 *
 * The board has no airline column, so this reads the designator off the front
 * of the flight number. The property worth protecting is that it refuses rather
 * than guesses: naming the wrong airline on a departure board is worse than
 * naming none.
 */

describe('airlineForFlightNo', () => {
  it('reads the designator off the front of the number', () => {
    expect(airlineForFlightNo('KC7361')?.code).toBe('KC');
    expect(airlineForFlightNo('DV762')?.code).toBe('DV');
    expect(airlineForFlightNo('IQ365')?.code).toBe('IQ');
    expect(airlineForFlightNo('TK256')?.code).toBe('TK');
  });

  // Designators are not always two letters: Wizz Air Abu Dhabi is 5W, and the
  // board carries its Abu Dhabi rotation every Tuesday.
  it('handles a designator that starts with a digit', () => {
    expect(airlineForFlightNo('5W7201')?.code).toBe('5W');
  });

  it('gives no carrier for one it does not know', () => {
    expect(airlineForFlightNo('ZZ1234')).toBeNull();
  });

  it('refuses anything that is not a flight number', () => {
    expect(airlineForFlightNo('')).toBeNull();
    expect(airlineForFlightNo('KC')).toBeNull();
    expect(airlineForFlightNo('KCABC')).toBeNull();
    // The raw form still has its space; only the normalised form is accepted,
    // so a caller passing the wrong one fails loudly rather than silently
    // attributing every flight to the airline whose code starts with a space.
    expect(airlineForFlightNo('KC 7361')).toBeNull();
  });
});

describe('airlineName', () => {
  it('answers in the locale asked for', () => {
    expect(airlineName('KC7361', 'en')).toBe('Air Astana');
    expect(airlineName('KC7361', 'ru')).toBe('Эйр Астана');
  });

  it('is null for an unknown carrier, so the caller shows nothing', () => {
    expect(airlineName('ZZ1234', 'ru')).toBeNull();
  });
});

describe('airlineLogoSrc', () => {
  /*
   * Every carrier is currently declared with `logo: null`, because the marks
   * are the airlines' own and are not in the repository yet. This test pins the
   * behaviour that matters either way: a carrier with no file must produce no
   * src at all, never a URL to something that is not there — an <img> pointed
   * at a missing file draws a broken-image glyph in the middle of the board.
   */
  it('is null while a carrier has no mark committed', () => {
    expect(airlineLogoSrc('KC7361')).toBeNull();
  });

  it('is null for an unknown carrier', () => {
    expect(airlineLogoSrc('ZZ1234')).toBeNull();
  });
});
