import { getTranslations } from 'next-intl/server';

import { buildFlightIcs } from '@/lib/flights/ics';
import { cityDisplayName } from '@/lib/flights/cities';
import { getFlightById } from '@/lib/flights/queries';
import { env } from '@/lib/env';
import { routing, type Locale } from '@/i18n/routing';

/** Reads SQLite; never the Edge runtime (plan §3.4). */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Calendar file for one flight (§17.3).
 *
 * Generated on the server so the client ships no calendar library, and so the
 * wall-clock-to-instant conversion happens in exactly one place.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const flight = getFlightById(id);

  if (!flight || !flight.scheduledTime) {
    return new Response('Flight not found.', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const requested = new URL(request.url).searchParams.get('locale');
  const locale = (
    routing.locales.includes(requested as Locale) ? requested : routing.defaultLocale
  ) as Locale;

  const t = await getTranslations({ locale, namespace: 'Board' });
  const tSite = await getTranslations({ locale, namespace: 'Site' });

  const body = buildFlightIcs(
    {
      kind: flight.kind,
      date: flight.date,
      scheduledTime: flight.scheduledTime,
      flightNo: flight.flightNo,
      city: cityDisplayName(flight.cityKey, locale, flight.cityRaw),
      airportName: tSite('name'),
      directionLabel: flight.kind === 'arrival' ? t('arrivals') : t('departures'),
      scheduledNote: t('scheduledTimesNote'),
      url: `${env.siteUrl}/flights`,
    },
    env.airportTz
  );

  const filename = `${flight.flightNo.replace(/\s+/g, '')}-${flight.date}.ics`;

  return new Response(body, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'public, max-age=300',
      'x-content-type-options': 'nosniff',
    },
  });
}
