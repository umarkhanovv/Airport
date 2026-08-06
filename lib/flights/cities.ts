/**
 * City dictionary (plan §5.5).
 *
 * The schedule prints destinations as bare uppercase Latin names (`ABU DHABI`,
 * `URALSK`). This maps them to display names per locale and to coordinates for
 * the weather lookup in Stage 4.
 *
 * A static table beats a geocoding API here: the route network is under twenty
 * cities, the mapping is deterministic, it works offline, and it adds no
 * network dependency to a page-render path.
 *
 * An unknown city is NOT an error. The board shows the raw name and simply has
 * no weather for it, and the admin sees a warning at upload time so the
 * dictionary can be extended.
 *
 * NOTE: Kazakh names are provisional and need native review alongside the UI
 * strings (plan §8 step 5).
 */

export interface CityInfo {
  /** Canonical dictionary key: uppercase, whitespace-collapsed. */
  key: string;
  names: { ru: string; en: string; kk: string };
  /** City-centre coordinates — weather is only meaningful at city granularity. */
  coords: { latitude: number; longitude: number };
}

const CITIES: readonly CityInfo[] = [
  {
    key: 'ALMATY',
    names: { ru: 'Алматы', en: 'Almaty', kk: 'Алматы' },
    coords: { latitude: 43.222, longitude: 76.8512 },
  },
  {
    key: 'ASTANA',
    names: { ru: 'Астана', en: 'Astana', kk: 'Астана' },
    coords: { latitude: 51.1694, longitude: 71.4491 },
  },
  {
    key: 'AKTAU',
    names: { ru: 'Актау', en: 'Aktau', kk: 'Ақтау' },
    coords: { latitude: 43.65, longitude: 51.15 },
  },
  {
    key: 'AKTOBE',
    names: { ru: 'Актобе', en: 'Aktobe', kk: 'Ақтөбе' },
    coords: { latitude: 50.2839, longitude: 57.167 },
  },
  {
    key: 'KOSTANAY',
    names: { ru: 'Костанай', en: 'Kostanay', kk: 'Қостанай' },
    coords: { latitude: 53.2144, longitude: 63.6246 },
  },
  {
    key: 'URALSK',
    names: { ru: 'Уральск', en: 'Uralsk', kk: 'Орал' },
    coords: { latitude: 51.2333, longitude: 51.3667 },
  },
  {
    key: 'ISTANBUL',
    names: { ru: 'Стамбул', en: 'Istanbul', kk: 'Стамбул' },
    coords: { latitude: 41.0082, longitude: 28.9784 },
  },
  {
    key: 'ABU DHABI',
    names: { ru: 'Абу-Даби', en: 'Abu Dhabi', kk: 'Абу-Даби' },
    coords: { latitude: 24.4539, longitude: 54.3773 },
  },
  {
    key: 'SAMARKAND',
    names: { ru: 'Самарканд', en: 'Samarkand', kk: 'Самарқанд' },
    coords: { latitude: 39.627, longitude: 66.975 },
  },
  {
    key: 'TURKISTAN',
    names: { ru: 'Туркестан', en: 'Turkistan', kk: 'Түркістан' },
    coords: { latitude: 43.2973, longitude: 68.2517 },
  },
];

const BY_KEY = new Map(CITIES.map((city) => [city.key, city]));

/**
 * Alternative spellings seen in the wild. `NUR-SULTAN` matters because the
 * city was renamed back to Astana in 2022 and older files may still use it;
 * `ORAL` is the Kazakh name for Uralsk.
 */
const ALIASES: Record<string, string> = {
  'NUR-SULTAN': 'ASTANA',
  NURSULTAN: 'ASTANA',
  ASTANA_NQZ: 'ASTANA',
  ORAL: 'URALSK',
  'ABU-DHABI': 'ABU DHABI',
  ABUDHABI: 'ABU DHABI',
  SAMARQAND: 'SAMARKAND',
  ISTANBUL_IST: 'ISTANBUL',
  TURKESTAN: 'TURKISTAN',
  'TURKISTAN CITY': 'TURKISTAN',
};

export function lookupCity(key: string): CityInfo | undefined {
  const normalized = key.trim().toUpperCase().replace(/\s+/g, ' ');
  return BY_KEY.get(normalized) ?? BY_KEY.get(ALIASES[normalized] ?? '');
}

export function isKnownCity(key: string): boolean {
  return lookupCity(key) !== undefined;
}

/** Falls back to the raw name so an unknown city still renders sensibly. */
export function cityDisplayName(key: string, locale: 'ru' | 'en' | 'kk', fallback: string): string {
  return lookupCity(key)?.names[locale] ?? fallback;
}

export const ALL_CITIES = CITIES;
