import { getWeather } from '@/lib/weather';
import { env } from '@/lib/env';

/** Network and an in-process cache; never the Edge runtime (plan §3.4). */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Weather for the cities currently on the board (spec §11.2).
 *
 * Fetched by the client *after* the board has painted, so it can never delay
 * the flight times. A failure here returns an empty list with 200 rather than
 * an error status: the client has nothing useful to do with a 502, and a
 * console full of red for a decorative feature helps nobody.
 */
export async function GET(request: Request) {
  if (!env.weatherEnabled) {
    return Response.json({ readings: [] }, { headers: { 'cache-control': 'no-store' } });
  }

  const raw = new URL(request.url).searchParams.get('cities') ?? '';
  const cities = raw
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean)
    // Bounded so a crafted URL cannot turn this into a request amplifier.
    .slice(0, 25);

  if (cities.length === 0) {
    return Response.json({ readings: [] }, { headers: { 'cache-control': 'no-store' } });
  }

  const readings = await getWeather(cities);

  return Response.json(
    { readings },
    {
      headers: {
        // Matches the server-side cache window; weather does not move fast.
        'cache-control': 'public, max-age=600',
      },
    }
  );
}
