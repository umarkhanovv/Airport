import 'server-only';

import { lookupCity } from '../flights/cities.ts';

/**
 * Destination and origin weather (spec §11.2).
 *
 * Departures show the weather where the aircraft is going, arrivals where it
 * came from. Useful rather than decorative — but strictly secondary, so the
 * single most important property of this module is that **it can fail without
 * anyone noticing**. Every path returns `null` instead of throwing, nothing
 * here is awaited during page render, and the board never waits on it.
 *
 * The provider sits behind an interface so swapping away from Open-Meteo is an
 * afternoon, not a refactor (plan decision #3).
 */

export interface WeatherReading {
  cityKey: string;
  temperatureC: number;
  /** WMO weather code, mapped to an icon and a translated label in the UI. */
  code: number;
  isDay: boolean;
}

export interface WeatherProvider {
  readonly name: string;
  fetchCurrent(cities: string[]): Promise<WeatherReading[]>;
}

/** Never let a slow upstream hold a request open. */
const TIMEOUT_MS = 2500;
/** Weather does not change fast enough to justify hitting the API per render. */
const CACHE_TTL_MS = 15 * 60 * 1000;

const cache = new Map<string, { reading: WeatherReading; expiresAt: number }>();

/**
 * Open-Meteo: free, no API key, so there is nothing for the airport to
 * configure and no secret to leak.
 */
export const openMeteoProvider: WeatherProvider = {
  name: 'open-meteo',

  async fetchCurrent(cityKeys: string[]): Promise<WeatherReading[]> {
    const known = cityKeys
      .map((key) => ({ key, city: lookupCity(key) }))
      .filter((entry): entry is { key: string; city: NonNullable<ReturnType<typeof lookupCity>> } =>
        Boolean(entry.city)
      );

    if (known.length === 0) return [];

    // One batched request for every city on the board rather than one each.
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', known.map((e) => e.city.coords.latitude).join(','));
    url.searchParams.set('longitude', known.map((e) => e.city.coords.longitude).join(','));
    url.searchParams.set('current', 'temperature_2m,weather_code,is_day');
    url.searchParams.set('timezone', 'UTC');

    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });

    if (!response.ok) throw new Error(`Weather upstream returned ${response.status}`);

    const payload = await response.json();
    // A single coordinate returns an object; several return an array.
    const entries = Array.isArray(payload) ? payload : [payload];

    return entries.flatMap((entry, index): WeatherReading[] => {
      const current = entry?.current;
      const key = known[index]?.key;
      if (!key || typeof current?.temperature_2m !== 'number') return [];

      return [
        {
          cityKey: key,
          temperatureC: Math.round(current.temperature_2m),
          code: typeof current.weather_code === 'number' ? current.weather_code : 0,
          isDay: current.is_day !== 0,
        },
      ];
    });
  },
};

/**
 * Cached, failure-swallowing read.
 *
 * Returns whatever it has. An upstream outage, a timeout, a schema change or a
 * blocked egress all produce an empty result and a board with no weather on
 * it — which is the correct outcome, not a degraded one.
 */
export async function getWeather(
  cityKeys: string[],
  provider: WeatherProvider = openMeteoProvider,
  now: number = Date.now()
): Promise<WeatherReading[]> {
  const wanted = [...new Set(cityKeys.filter(Boolean))];
  const fresh: WeatherReading[] = [];
  const stale: string[] = [];

  for (const key of wanted) {
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now) fresh.push(hit.reading);
    else stale.push(key);
  }

  if (stale.length === 0) return fresh;

  try {
    const readings = await provider.fetchCurrent(stale);
    for (const reading of readings) {
      cache.set(reading.cityKey, { reading, expiresAt: now + CACHE_TTL_MS });
    }
    return [...fresh, ...readings];
  } catch {
    // Deliberately silent to the caller. Weather is never worth an error page,
    // and the board has already rendered without it.
    return fresh;
  }
}

/** Test seam. */
export function clearWeatherCache(): void {
  cache.clear();
}
