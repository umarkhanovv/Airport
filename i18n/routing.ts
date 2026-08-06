import { defineRouting } from 'next-intl/routing';

/**
 * Locale identifiers are BCP-47 language codes: `ru`, `en`, `kk`.
 *
 * The URL prefix for Kazakh is `/kz`, not `/kk`, because the legacy WordPress
 * site published Kazakh pages under `/kz/` and we are preserving ~76 inbound
 * URLs (plan §1.3, decision #4).
 *
 * Keeping the *identifier* as `kk` while remapping only the *prefix* means
 * `<html lang={locale}>` and `hreflang={locale}` are correct by construction.
 * `kz` is a country code (Kazakhstan); the language is `kk`. Writing
 * `lang="kz"` would be wrong, and this arrangement makes it impossible.
 */
export const routing = defineRouting({
  locales: ['ru', 'en', 'kk'],
  defaultLocale: 'ru',
  localePrefix: {
    // `as-needed`: Russian lives at the root (`/about`), the others are
    // prefixed (`/en/about`, `/kz/about`) — mirroring the legacy site.
    mode: 'as-needed',
    prefixes: {
      kk: '/kz',
    },
  },

  /**
   * The URL alone determines the language. Nothing else.
   *
   * Both of these default to on, and both make `/` respond differently
   * depending on who is asking — via `Accept-Language` and via a cookie.
   * That is wrong here for three reasons:
   *
   *  - Spec §4 requires stable URLs. A header-dependent homepage is not one.
   *  - The airport self-hosts behind its own reverse proxy. A response that
   *    varies by header but is cached without a correct `Vary` serves Kazakh
   *    users an English page — a routine and hard-to-debug ops failure.
   *  - It costs the majority audience (Russian-speaking, local) a redirect
   *    hop on every cold visit, against the budget in plan §9.2.
   *
   * Language is chosen explicitly through the switcher, and advertised to
   * search engines through `hreflang`. Disabling the cookie also means the
   * site sets no cookie at all for locale purposes.
   */
  localeDetection: false,
  localeCookie: false,
});

export type Locale = (typeof routing.locales)[number];

/** Locales in the order they should appear in the language switcher. */
export const LOCALES = routing.locales;

/** Human-readable, self-referential locale names (always shown in their own language). */
export const LOCALE_LABELS: Record<Locale, string> = {
  ru: 'Русский',
  en: 'English',
  kk: 'Қазақша',
};
