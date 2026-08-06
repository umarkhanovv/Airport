import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearWeatherCache,
  getWeather,
  openMeteoProvider,
  type WeatherProvider,
  type WeatherReading,
} from '@/lib/weather';

/**
 * Weather (spec §11.2) — the Stage 4 exit criterion.
 *
 * The spec is explicit that weather "degrades silently" and "never blocks the
 * board". So the property under test is not that it works; it is that **every
 * way it can fail produces an empty result rather than an exception**. If any
 * of these throws, a weather outage takes the flight board down with it.
 */

const reading = (cityKey: string): WeatherReading => ({
  cityKey,
  temperatureC: 21,
  code: 0,
  isDay: true,
});

function providerThat(behaviour: () => Promise<WeatherReading[]>): WeatherProvider {
  return { name: 'test', fetchCurrent: behaviour };
}

beforeEach(() => clearWeatherCache());

describe('failure is always silent', () => {
  it('returns empty when the provider throws', async () => {
    const provider = providerThat(async () => {
      throw new Error('upstream exploded');
    });
    await expect(getWeather(['ALMATY'], provider)).resolves.toEqual([]);
  });

  it('returns empty when the provider rejects with a non-Error', async () => {
    const provider = providerThat(() => Promise.reject('nope'));
    await expect(getWeather(['ALMATY'], provider)).resolves.toEqual([]);
  });

  it('returns empty when the provider times out', async () => {
    const provider = providerThat(async () => {
      throw new DOMException('The operation was aborted.', 'TimeoutError');
    });
    await expect(getWeather(['ALMATY'], provider)).resolves.toEqual([]);
  });

  it('returns empty when the provider returns malformed data', async () => {
    const provider = providerThat(async () => null as unknown as WeatherReading[]);
    await expect(getWeather(['ALMATY'], provider)).resolves.toEqual([]);
  });

  it('never rejects, whatever the provider does', async () => {
    const behaviours = [
      () => Promise.reject(new Error('boom')),
      () => Promise.reject(undefined),
      async () => {
        throw new TypeError('fetch failed');
      },
    ];

    for (const behaviour of behaviours) {
      await expect(getWeather(['ALMATY'], providerThat(behaviour))).resolves.toBeInstanceOf(Array);
    }
  });

  it('still returns cached cities when a later fetch fails', async () => {
    const ok = providerThat(async () => [reading('ALMATY')]);
    await getWeather(['ALMATY'], ok);

    // ALMATY is cached; ASTANA is not and the provider now fails.
    const failing = providerThat(async () => {
      throw new Error('down');
    });
    const result = await getWeather(['ALMATY', 'ASTANA'], failing);

    expect(result.map((r) => r.cityKey)).toEqual(['ALMATY']);
  });
});

describe('caching', () => {
  it('does not call the provider twice for a cached city', async () => {
    const fetchCurrent = vi.fn(async () => [reading('ALMATY')]);
    const provider: WeatherProvider = { name: 'test', fetchCurrent };

    await getWeather(['ALMATY'], provider);
    await getWeather(['ALMATY'], provider);

    expect(fetchCurrent).toHaveBeenCalledTimes(1);
  });

  it('only asks for the cities it does not already have', async () => {
    const fetchCurrent = vi.fn(async (cities: string[]) => cities.map(reading));
    const provider: WeatherProvider = { name: 'test', fetchCurrent };

    await getWeather(['ALMATY'], provider);
    await getWeather(['ALMATY', 'ASTANA'], provider);

    expect(fetchCurrent).toHaveBeenLastCalledWith(['ASTANA']);
  });

  it('refetches once the entry expires', async () => {
    const fetchCurrent = vi.fn(async () => [reading('ALMATY')]);
    const provider: WeatherProvider = { name: 'test', fetchCurrent };

    await getWeather(['ALMATY'], provider, 0);
    await getWeather(['ALMATY'], provider, 60 * 60 * 1000);

    expect(fetchCurrent).toHaveBeenCalledTimes(2);
  });

  it('deduplicates and ignores blanks without calling the provider', async () => {
    const fetchCurrent = vi.fn(async (cities: string[]) => cities.map(reading));
    const provider: WeatherProvider = { name: 'test', fetchCurrent };

    await getWeather(['ALMATY', 'ALMATY', ''], provider);
    expect(fetchCurrent).toHaveBeenCalledWith(['ALMATY']);

    fetchCurrent.mockClear();
    await getWeather([], provider);
    expect(fetchCurrent).not.toHaveBeenCalled();
  });
});

describe('open-meteo adapter', () => {
  it('asks only for cities in the dictionary, and not at all otherwise', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await openMeteoProvider.fetchCurrent(['ATLANTIS', 'NOWHERE']);
    expect(fetchSpy, 'unknown cities must not cause a request').not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('batches every known city into a single request', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));

    await openMeteoProvider.fetchCurrent(['ALMATY', 'ASTANA', 'AKTAU']);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain('latitude=');
    // Three coordinates, comma-separated, in one call.
    expect(
      decodeURIComponent(url)
        .match(/latitude=([^&]+)/)?.[1]
        .split(',')
    ).toHaveLength(3);
    fetchSpy.mockRestore();
  });

  it('surfaces a non-200 as a throw, which getWeather then swallows', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('nope', { status: 503 }));

    await expect(openMeteoProvider.fetchCurrent(['ALMATY'])).rejects.toThrow();
    // The layer above must absorb it.
    await expect(getWeather(['ALMATY'], openMeteoProvider)).resolves.toEqual([]);

    fetchSpy.mockRestore();
  });

  it('drops entries with no usable temperature rather than rendering nonsense', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify([
            { current: { temperature_2m: 18.4, weather_code: 3, is_day: 1 } },
            { current: { temperature_2m: null } },
          ]),
          { status: 200 }
        )
      );

    const result = await openMeteoProvider.fetchCurrent(['ALMATY', 'ASTANA']);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ cityKey: 'ALMATY', temperatureC: 18, code: 3 });
    fetchSpy.mockRestore();
  });
});
