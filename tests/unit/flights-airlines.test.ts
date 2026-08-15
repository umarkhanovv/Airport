import { existsSync } from 'node:fs';
import path from 'node:path';

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
  // One name on all three versions of the site: a company's own name is not a
  // word to be translated, and it has to match the mark printed beside it.
  it('gives the carrier its own name, whatever the page language', () => {
    expect(airlineName('KC7361')).toBe('Air Astana');
    expect(airlineName('DV762')).toBe('SCAT Airlines');
    expect(airlineName('5W7201')).toBe('Wizz Air Abu Dhabi');
  });

  it('is null for an unknown carrier, so the caller shows nothing', () => {
    expect(airlineName('ZZ1234')).toBeNull();
  });
});

describe('airlineLogoSrc', () => {
  it('points into the public folder', () => {
    expect(airlineLogoSrc('KC7361')).toBe('/airlines/kc.svg');
  });

  it('is null for an unknown carrier', () => {
    expect(airlineLogoSrc('ZZ1234')).toBeNull();
  });

  /*
   * Every declared mark has to be on disk.
   *
   * This is the failure the `logo: null` switch exists to prevent, and the one
   * a person cannot be relied on to catch: an `<img>` aimed at a file that is
   * not there draws a broken-image glyph in the middle of a flight board, and
   * it does it on every row that carrier flies. Deleting a file, renaming one,
   * or adding a carrier and forgetting the artwork all fail here instead.
   *
   * Same guarantee `content-assets.test.ts` gives the `/media/` links.
   */
  it('every mark the dictionary declares is actually committed', () => {
    const declared = ['KC7361', 'DV762', 'IQ365', 'TK256', '5W7201']
      .map((flightNo) => [flightNo, airlineLogoSrc(flightNo)] as const)
      .filter(([, src]) => src !== null);

    // If this drops to zero the loop below stops proving anything.
    expect(declared.length).toBeGreaterThan(0);

    for (const [flightNo, src] of declared) {
      const file = path.join(process.cwd(), 'public', src!.replace(/^\//, ''));
      expect(existsSync(file), `${flightNo}: ${src} is declared but not in public/`).toBe(true);
    }
  });
});
