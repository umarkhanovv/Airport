import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  AIRLINE_NONE,
  airlineForFlight,
  airlineForFlightNo,
  airlineLogo,
  airlineName,
} from '@/lib/flights/airlines';

/** The board hands these functions a flight, so the tests do too. */
const flight = (flightNo: string, airline: string | null = null) => ({ flightNo, airline });

/** One flight number per carrier the dictionary knows. */
const CARRIERS = ['KC7361', 'DV762', 'IQ365', 'TK256', '5W7201'];

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
    expect(airlineName(flight('KC 7361'))).toBe('Air Astana');
    expect(airlineName(flight('DV 762'))).toBe('SCAT Airlines');
    expect(airlineName(flight('5W7201'))).toBe('Wizz Air Abu Dhabi');
  });

  it('is null for an unknown carrier, so the caller shows nothing', () => {
    expect(airlineName(flight('ZZ 1234'))).toBeNull();
  });
});

describe('airlineForFlight', () => {
  /*
   * The bug this exists to stop.
   *
   * The identity key never changes when staff correct a flight number — that is
   * what keeps an edit attached to its flight across a re-upload. Deriving the
   * carrier from it therefore left the old airline behind, and the board printed
   * `KC 365` beside the Qazaq Air mark: the number naming one airline and the
   * logo another, on the same row.
   */
  it('follows the number as displayed, not the identity key', () => {
    expect(airlineForFlight({ flightNo: 'KC 365' })?.name).toBe('Air Astana');
    // Spaces and case are the display form's business, not the caller's.
    expect(airlineForFlight({ flightNo: 'kc 365' })?.name).toBe('Air Astana');
    expect(airlineForFlight({ flightNo: '5W7201' })?.name).toBe('Wizz Air Abu Dhabi');
  });

  // A charter, a wet-lease, a codeshare flown on somebody else's aircraft —
  // cases only staff can know about, where the number is not the operator.
  it('lets an explicit choice overrule the number', () => {
    expect(airlineForFlight({ flightNo: 'KC 365', airline: 'DV' })?.name).toBe('SCAT Airlines');
  });

  it('shows no carrier at all when staff say so', () => {
    expect(airlineForFlight({ flightNo: 'KC 365', airline: AIRLINE_NONE })).toBeNull();
    expect(airlineName({ flightNo: 'KC 365', airline: AIRLINE_NONE })).toBeNull();
    expect(airlineLogo({ flightNo: 'KC 365', airline: AIRLINE_NONE })).toBeNull();
  });

  // Null is silence, and silence hands the question back to the flight number.
  it('falls back to the number when the choice is cleared', () => {
    expect(airlineForFlight({ flightNo: 'KC 365', airline: null })?.name).toBe('Air Astana');
  });

  it('gives nothing for a code it does not know', () => {
    expect(airlineForFlight({ flightNo: 'KC 365', airline: 'ZZ' })).toBeNull();
  });
});

describe('the marks on disk', () => {
  it('point into the public folder', () => {
    expect(airlineLogo(flight('KC 7361'))?.src).toBe('/airlines/kc.svg');
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
    const declared = CARRIERS.map(
      (flightNo) => [flightNo, airlineLogo(flight(flightNo))?.src ?? null] as const
    ).filter(([, src]) => src !== null);

    // If this drops to zero the loop below stops proving anything.
    expect(declared.length).toBeGreaterThan(0);

    for (const [flightNo, src] of declared) {
      const file = path.join(process.cwd(), 'public', src!.replace(/^\//, ''));
      expect(existsSync(file), `${flightNo}: ${src} is declared but not in public/`).toBe(true);
    }
  });
});

describe('airlineLogo', () => {
  it('sizes the mark to a single row height', () => {
    const logo = airlineLogo(flight('IQ 365'))!;
    expect(logo.height).toBe(16);
    expect(logo.width).toBe(42);
    expect(logo.alt).toBe('Qazaq Air');
  });

  it('is null for a carrier with no mark', () => {
    expect(airlineLogo(flight('ZZ 1234'))).toBeNull();
  });

  /*
   * The declared aspect has to match the artwork.
   *
   * These attributes are what makes the mark the right size before any CSS is
   * read — and a wrong number is invisible in a browser that does apply the
   * stylesheet, which is how a 600-pixel-wide wordmark reached a flight board
   * in Safari while Chromium showed it at 42×16. A file swapped for a squarer
   * or wider version fails here rather than on somebody's screen.
   */
  it('matches the aspect ratio of the file on disk', () => {
    for (const flightNo of CARRIERS) {
      const logo = airlineLogo(flight(flightNo));
      if (!logo) continue;

      const svg = readFileSync(
        path.join(process.cwd(), 'public', logo.src.replace(/^\//, '')),
        'utf8'
      );
      const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1];

      // Not every mark carries a viewBox; those state width and height instead.
      const [w, h] = viewBox
        ? viewBox
            .trim()
            .split(/[\s,]+/)
            .map(Number)
            .slice(2)
        : [Number(/\swidth="([\d.]+)/.exec(svg)?.[1]), Number(/\sheight="([\d.]+)/.exec(svg)?.[1])];

      expect(Number.isFinite(w) && Number.isFinite(h) && h > 0, `${flightNo}: unreadable SVG`).toBe(
        true
      );

      const expected = Math.round(16 * (w / h));
      expect(
        logo.width,
        `${flightNo}: declared ${logo.width}px wide, artwork wants ${expected}px`
      ).toBe(expected);
    }
  });
});
