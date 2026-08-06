import { env } from './env.ts';

import { routing, type Locale } from '../i18n/routing.ts';

/**
 * Canonical and `hreflang` URLs (plan Stage 9, §7).
 *
 * Next generates no `hreflang` of its own, so every page that wants alternates
 * has to declare them. This builds both from one locale-independent path.
 *
 * The distinction the routing config draws is load-bearing here: the language
 * *identifier* is `kk` and the URL *prefix* is `/kz`. `hreflang` takes the
 * identifier — `hreflang="kz"` would name Kazakhstan the country rather than
 * the Kazakh language — while the href takes the prefix.
 */

/** The URL prefix for a locale. Russian is unprefixed (`as-needed`). */
export function prefixFor(locale: Locale): string {
  if (locale === routing.defaultLocale) return '';

  // `localePrefix` is a union, and the `never` arm carries no `prefixes` — so
  // it is read defensively rather than asserted away. Kazakh is the only locale
  // with an override (`/kz`), and it is the one this must not get wrong.
  const configured = routing.localePrefix;
  const prefixes =
    typeof configured === 'object' && 'prefixes' in configured ? (configured.prefixes ?? {}) : {};

  return prefixes[locale] ?? `/${locale}`;
}

/**
 * An absolute URL for one locale.
 *
 * `path` is the route without any locale prefix — `/airport/parking`, or `/`
 * for a locale's home page.
 */
export function urlFor(locale: Locale, path = '/'): string {
  const normalised = path === '/' ? '' : `/${path.replace(/^\/+|\/+$/g, '')}`;
  return `${env.siteUrl}${prefixFor(locale)}${normalised}`;
}

export interface Alternates {
  canonical: string;
  languages: Record<string, string>;
}

/**
 * Canonical plus one alternate per locale, for a page's `alternates` metadata.
 *
 * `x-default` points at Russian: it is the airport's own language and the
 * majority audience, and locale detection is deliberately off (see
 * i18n/routing.ts), so there is no negotiated landing page to point at.
 */
export function alternatesFor(locale: Locale, path = '/'): Alternates {
  const languages: Record<string, string> = {};
  for (const other of routing.locales) {
    languages[other] = urlFor(other, path);
  }
  languages['x-default'] = urlFor(routing.defaultLocale, path);

  return { canonical: urlFor(locale, path), languages };
}
