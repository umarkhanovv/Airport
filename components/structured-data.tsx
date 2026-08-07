import { getTranslations } from 'next-intl/server';

import { AIRPORT_ALIASES, AIRPORT_CODES, AIRPORT_CONTACTS, AIRPORT_COORDS } from '@/lib/constants';
import { env } from '@/lib/env';
import { routing } from '@/i18n/routing';

/**
 * `schema.org/Airport` structured data (plan Stage 9).
 *
 * Only facts that were verified go in, because a wrong one here is worse than a
 * missing one: search engines repeat it. The codes and coordinates come from the
 * operator's own published material, and the address, telephone and e-mail from
 * the footer the operator publishes on every page of the legacy site (see
 * `lib/constants.ts`).
 *
 * The street address is the one a visitor needs — the aerodrome itself — rather
 * than the registered office in the city, which is where the company is
 * incorporated and not where the aircraft are.
 *
 * The alternate names matter locally: the airport is still widely called
 * Хазрет Султан, so someone searching that name should find this site
 * (plan §1.2).
 */
export async function AirportStructuredData({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'Site' });
  const tContacts = await getTranslations({ locale, namespace: 'Contacts' });

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
      streetAddress: tContacts('airportAddressValue'),
    },
    // One of each: schema.org takes a list, but a search result showing three
    // numbers and two addresses helps nobody decide which to use.
    telephone: AIRPORT_CONTACTS.phones[0].tel,
    email: AIRPORT_CONTACTS.emails[0],
    sameAs: AIRPORT_CONTACTS.social.map((account) => account.url),
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
