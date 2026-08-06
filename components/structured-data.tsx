import { getTranslations } from 'next-intl/server';

import { AIRPORT_ALIASES, AIRPORT_CODES, AIRPORT_COORDS } from '@/lib/constants';
import { env } from '@/lib/env';
import { routing } from '@/i18n/routing';

/**
 * `schema.org/Airport` structured data (plan Stage 9).
 *
 * Only facts that were verified go in. The airport's codes and coordinates come
 * from the operator's own published material (see `lib/constants.ts`); the
 * postal address and telephone numbers do not appear here because they arrive
 * with the content migration and have not been confirmed — a wrong address in
 * structured data is worse than none, since search engines will repeat it.
 *
 * The alternate names matter locally: the airport is still widely called
 * Хазрет Султан, so someone searching that name should find this site
 * (plan §1.2).
 */
export async function AirportStructuredData({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'Site' });

  const localePath = locale === routing.defaultLocale ? '' : `/${locale === 'kk' ? 'kz' : locale}`;

  const data = {
    '@context': 'https://schema.org',
    '@type': 'Airport',
    name: t('name'),
    alternateName: [...AIRPORT_ALIASES],
    description: t('description'),
    iataCode: AIRPORT_CODES.iata,
    icaoCode: AIRPORT_CODES.icao,
    url: `${env.siteUrl}${localePath}`,
    geo: {
      '@type': 'GeoCoordinates',
      latitude: AIRPORT_COORDS.latitude,
      longitude: AIRPORT_COORDS.longitude,
    },
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'KZ',
      addressLocality: t('location'),
    },
  };

  return (
    <script
      type="application/ld+json"
      // JSON-LD is data, not code: the browser never executes it, and React has
      // no way to render a script body other than this.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
