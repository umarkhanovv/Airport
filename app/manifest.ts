import type { MetadataRoute } from 'next';
import { getTranslations } from 'next-intl/server';

import { routing } from '@/i18n/routing';

/**
 * Web app manifest (plan Stage 9, spec §17.4).
 *
 * One manifest, in the airport's own language. A manifest cannot vary by locale
 * — the browser fetches exactly one for an origin — so it carries Russian, the
 * default locale and the majority audience. The installed app still opens at
 * `/`, which is the Russian home page, and the language switcher works from
 * there as usual.
 *
 * `start_url` deliberately points at the home page rather than the flight
 * board: someone installing this wants the airport, and the board is one tap
 * away with the schedule cached for offline use either way.
 */
export const dynamic = 'force-static';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const t = await getTranslations({ locale: routing.defaultLocale, namespace: 'Site' });

  return {
    name: t('name'),
    short_name: t('shortName'),
    description: t('description'),
    lang: routing.defaultLocale,
    dir: 'ltr',

    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',

    // Matches the light surface token. The dark-scheme colour is declared
    // separately in the layout's viewport export, which the manifest has no
    // way to express.
    background_color: '#ffffff',
    theme_color: '#ffffff',

    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // A separate maskable icon, with the mark pulled inside the inner 80% so
      // Android's circular and squircle masks do not crop it.
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
