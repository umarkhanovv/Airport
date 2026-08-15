/**
 * Airline dictionary.
 *
 * The schedule has no airline column — the workbook's headers are
 * `DATE ARR ORG STA ETA RMA B DEP DES STD ETD RMD REG A/C` and not one of them
 * names a carrier. The only signal is the flight number itself: every
 * commercial flight number opens with the airline's two-character IATA
 * designator, so `KC 7361` is Air Astana and `5W7201` is Wizz Air Abu Dhabi.
 *
 * A static table for the same reasons `cities.ts` is one: the route network is
 * five carriers, the mapping is deterministic, it works offline, and it adds no
 * network call to a page render. An unknown designator is not an error — the
 * flight shows exactly as it does today, without a name or a mark.
 *
 * The marks themselves are the carriers' own trademarks, used here to identify
 * who operates the flight. That is what a timetable is for, and it is why they
 * are named rather than redrawn: an approximation of an airline's logo would be
 * both worse and less honest than none.
 *
 * NOTE: the Kazakh names are provisional and want a native speaker, the same
 * caveat that stands over the city dictionary.
 */

export interface AirlineInfo {
  /** IATA designator, exactly two characters. `5W` and `9C` are legal too. */
  code: string;
  names: { ru: string; en: string; kk: string };
  /**
   * Filename under `public/airlines`, or `null` when we have no mark for this
   * carrier yet.
   *
   * Null is the switch, not an accident. An `<img>` pointed at a file that does
   * not exist renders a broken-image glyph in the middle of a flight board, so
   * a logo is declared here only once the file is actually committed. Dropping
   * `kc.svg` into `public/airlines` and changing one `null` on the line below
   * is the whole of turning a logo on.
   */
  logo: string | null;
}

const AIRLINES: readonly AirlineInfo[] = [
  {
    code: 'KC',
    names: { ru: 'Эйр Астана', en: 'Air Astana', kk: 'Эйр Астана' },
    logo: null,
  },
  {
    code: 'DV',
    names: { ru: 'СКАТ', en: 'SCAT Airlines', kk: 'СКАТ' },
    logo: null,
  },
  {
    code: 'IQ',
    names: { ru: 'Qazaq Air', en: 'Qazaq Air', kk: 'Qazaq Air' },
    logo: null,
  },
  {
    code: 'TK',
    names: { ru: 'Turkish Airlines', en: 'Turkish Airlines', kk: 'Turkish Airlines' },
    logo: null,
  },
  {
    code: '5W',
    names: { ru: 'Wizz Air Abu Dhabi', en: 'Wizz Air Abu Dhabi', kk: 'Wizz Air Abu Dhabi' },
    logo: null,
  },
];

const BY_CODE = new Map(AIRLINES.map((airline) => [airline.code, airline]));

/**
 * The carrier operating a flight, read off the front of its number.
 *
 * Takes the normalised form (`KC7361`), which is already uppercase with the
 * spaces stripped — the raw `KC 7361` would need the same work done twice.
 * Anything that is not two characters followed by at least one digit is not a
 * flight number we can attribute, and gets no carrier rather than a guessed
 * one.
 */
export function airlineForFlightNo(flightNoNorm: string): AirlineInfo | null {
  if (!/^[A-Z0-9]{2}\d/.test(flightNoNorm)) return null;
  return BY_CODE.get(flightNoNorm.slice(0, 2)) ?? null;
}

/** The carrier's name in one locale, or `null` when we do not know the carrier. */
export function airlineName(flightNoNorm: string, locale: 'ru' | 'en' | 'kk'): string | null {
  return airlineForFlightNo(flightNoNorm)?.names[locale] ?? null;
}

/** Public URL of a carrier's mark, or `null` when there is no file for it. */
export function airlineLogoSrc(flightNoNorm: string): string | null {
  const logo = airlineForFlightNo(flightNoNorm)?.logo;
  return logo ? `/airlines/${logo}` : null;
}
