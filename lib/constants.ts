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

// NOTE: IATA/ICAO codes are intentionally absent. They are needed for
// `schema.org/Airport` in Stage 9 and must be verified against an
// authoritative source before use — not recalled from memory.

/**
 * The airport's alternate name, still in public use. Registered as an SEO
 * alias and an on-site search synonym (plan §1.2).
 */
export const AIRPORT_ALIASES = ['Хазрет Султан', 'Khazret Sultan', 'Hazret Sultan'] as const;

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
