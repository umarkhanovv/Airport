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
 * One name, in English, on all three versions of the site. A company's own
 * name is not a word to be translated — «Эйр Астана» is a transliteration of
 * `Air Astana` rather than a Russian name for it, and half the carriers here
 * (Qazaq Air, Wizz Air Abu Dhabi, Turkish Airlines) never had one to begin
 * with. Rendering the same string everywhere also means it matches the mark
 * beside it and the livery on the aircraft.
 */

export interface AirlineInfo {
  /** IATA designator, exactly two characters. `5W` and `9C` are legal too. */
  code: string;
  /** As the carrier writes it. Not localised — see above. */
  name: string;
  /**
   * Filename under `public/airlines`, or `null` when we have no mark for this
   * carrier yet.
   *
   * Null is the switch, not an accident. An `<img>` pointed at a file that does
   * not exist renders a broken-image glyph in the middle of a flight board, so
   * a logo is declared here only once the file is actually committed — and the
   * board falls back to the carrier's name in plain text.
   */
  logo: string | null;
  /**
   * The mark's own width ÷ height, taken from its viewBox.
   *
   * Here rather than left to CSS because it is what lets the `<img>` carry real
   * `width` and `height` attributes. Without them the browser has nothing to go
   * on until the stylesheet arrives, and an unstyled wordmark renders at its
   * natural size — which for these is several hundred pixels across, in the
   * middle of a flight board. That is not a hypothetical: it is what Safari
   * showed when it had a stale copy of the stylesheet and this file did not yet
   * supply the numbers.
   */
  aspect: number;
}

/** How tall a mark is drawn, and the height its attributes are computed from. */
export const AIRLINE_LOGO_HEIGHT = 16;

/*
 * Every mark below came from Wikimedia, where each is published as
 * {{PD-textlogo}} — lettering below the threshold of originality, so not
 * copyrightable — and flagged as trademarked, which is the part that matters
 * and the part this use satisfies. A timetable naming the carrier that operates
 * a flight is nominative use, the same thing every departure board in the world
 * does. Sources, in case they ever need re-fetching:
 *
 *   KC  en.wikipedia.org/wiki/File:Air_Astana_logo.svg
 *   DV  commons.wikimedia.org/wiki/File:SCAT_Air_Company_Logo.svg
 *   IQ  commons.wikimedia.org/wiki/File:Qazaq_Air_logo.svg
 *   TK  commons.wikimedia.org/wiki/File:Turkish_Airlines_logo_2019_compact.svg
 *   5W  commons.wikimedia.org/wiki/File:Wizz_Air_logo_2015.svg
 *
 * Wizz Air Abu Dhabi flies under the Wizz Air mark; there is no separate one.
 * All five are wordmarks rather than symbols — between two and four times as
 * wide as they are tall — which is why the board gives them a line of their
 * own instead of a square badge, and why they replace the printed name rather
 * than sitting beside it.
 */
const AIRLINES: readonly AirlineInfo[] = [
  { code: 'KC', name: 'Air Astana', logo: 'kc.svg', aspect: 3.9465 },
  { code: 'DV', name: 'SCAT Airlines', logo: 'dv.svg', aspect: 4.6268 },
  { code: 'IQ', name: 'Qazaq Air', logo: 'iq.svg', aspect: 2.6161 },
  { code: 'TK', name: 'Turkish Airlines', logo: 'tk.svg', aspect: 3.7174 },
  { code: '5W', name: 'Wizz Air Abu Dhabi', logo: '5w.svg', aspect: 2.1667 },
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

/** The carrier's name, or `null` when we do not know the carrier. */
export function airlineName(flightNoNorm: string): string | null {
  return airlineForFlightNo(flightNoNorm)?.name ?? null;
}

/** Public URL of a carrier's mark, or `null` when there is no file for it. */
export function airlineLogoSrc(flightNoNorm: string): string | null {
  const logo = airlineForFlightNo(flightNoNorm)?.logo;
  return logo ? `/airlines/${logo}` : null;
}

export interface AirlineLogo {
  src: string;
  /** Rounded to whole pixels: `<img>` attributes are integers. */
  width: number;
  height: number;
  alt: string;
}

/**
 * Everything an `<img>` needs to draw a carrier's mark at the right size.
 *
 * The dimensions are real attributes rather than a job left to CSS, so the
 * board is the right shape from the first byte of HTML — before the stylesheet
 * lands, if it is cached stale, and if it never arrives at all.
 */
export function airlineLogo(flightNoNorm: string): AirlineLogo | null {
  const airline = airlineForFlightNo(flightNoNorm);
  if (!airline?.logo) return null;

  return {
    src: `/airlines/${airline.logo}`,
    width: Math.round(AIRLINE_LOGO_HEIGHT * airline.aspect),
    height: AIRLINE_LOGO_HEIGHT,
    alt: airline.name,
  };
}
