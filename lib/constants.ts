/**
 * Airport-wide constants. Safe to import from both server and client code.
 */

/**
 * Airport location, extracted from the Google Maps embed on the legacy
 * `/airport-map/` page (plan §1.2). Used for the location map, `schema.org`
 * structured data and "how to get here" content.
 */
export const AIRPORT_COORDS = {
  latitude: 43.30965,
  longitude: 68.54065,
} as const;

/**
 * Airport codes, for `schema.org/Airport` (spec §5, plan Stage 9).
 *
 * Left blank until Stage 9 on purpose: these had to be verified rather than
 * recalled. The source is the operator's own statement on hsairport.kz —
 * "Код аэропорта: ICAO – UAIT, IATA – HSA" — published with the airport's
 * certification announcement and read out of the Stage 8 crawl. The same
 * paragraph gives the runway as 3300 × 45 m and the aerodrome as ICAO
 * category 4D, if that is ever needed.
 */
export const AIRPORT_CODES = {
  iata: 'HSA',
  icao: 'UAIT',
} as const;

/**
 * The airport's alternate name, still in public use. Registered as an SEO
 * alias and an on-site search synonym (plan §1.2).
 */
export const AIRPORT_ALIASES = ['Хазрет Султан', 'Khazret Sultan', 'Hazret Sultan'] as const;

/**
 * Link to eOtinish, the state e-appeals portal, which spec §9 requires to be
 * preserved from the legacy site.
 *
 * Copied from the legacy footer rather than recalled, under the rule the IATA
 * codes above follow: this one routes citizens to a government service with a
 * legally registered response, and a guessed address would be worse than no
 * link at all. The legacy anchor carries the portal's own referral campaign
 * parameters and a `/kk` path; both are dropped, so the portal picks the
 * language rather than being forced into Kazakh for a reader who chose Russian.
 */
export const EOTINISH_URL: string | null = 'https://eotinish.kz/';

/**
 * Published contact details, read out of the legacy site's footer during the
 * Stage 8 crawl. Addresses are translated and live in the message catalogues;
 * everything here is the same in every language.
 *
 * The three legacy footers each published a different subset — the Russian one
 * a mobile the other two did not have, the Kazakh one an e-mail on a different
 * domain — and the airport's decision was to publish all of them, everywhere,
 * rather than pick. That is the right call for a contact page: a passenger who
 * reaches a number that is answered does not care which page it came from, and
 * a number omitted because it appeared in only one language is a number nobody
 * can reach.
 */
export const AIRPORT_CONTACTS = {
  /**
   * `tel` values are E.164 so a phone dials them; labels are how the airport
   * writes them. The landline leads: it is the one all three footers agreed on.
   */
  phones: [
    { tel: '+77253352909', label: '+7 72533 5 29 09', kind: 'landline' },
    { tel: '+77012344517', label: '+7 701 234 45 17', kind: 'mobile' },
    { tel: '+77020470768', label: '+7 702 047 07 68', kind: 'mobile' },
  ],
  /** The airport's own domain first; tia.com.kz is the operator's. */
  emails: ['office@hsairport.kz', 'info.hsa@tia.com.kz'],
  social: [
    { name: 'Instagram', url: 'https://www.instagram.com/turkistan_airport' },
    { name: 'Facebook', url: 'https://www.facebook.com/turkistaninternationalairport' },
    // x.com, not the twitter.com the legacy footer still points at.
    { name: 'X', url: 'https://x.com/turkistanairprt' },
  ],
} as const;

/**
 * The seven top-level sections of the reorganised information architecture
 * (spec §5). Subsection labels are deliberately absent: plan §1.4 charters
 * Stage 8 to reconcile the full 74-page inventory against this IA before any
 * subsection structure is committed to.
 */
export const SECTIONS = [
  'flights',
  'airport',
  'passengers',
  'about',
  'partners',
  'press',
  'contacts',
] as const;

export type Section = (typeof SECTIONS)[number];

export function isSection(value: string): value is Section {
  return (SECTIONS as readonly string[]).includes(value);
}
