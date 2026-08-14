import 'server-only';

import { hasLocale } from 'next-intl';
import { cookies } from 'next/headers';

import { routing, type Locale } from '../../i18n/routing.ts';

/**
 * Which language the admin panel is in.
 *
 * A cookie, not a URL segment. The public site puts the locale in the path
 * because its URLs are shared, indexed and permanent (see `i18n/routing.ts`);
 * the panel's are none of those things. Staff bookmark `/admin` and nobody
 * links to it, so moving it under `[locale]` would rewrite every route, the
 * login `?next=` round trip and every end-to-end path to buy nothing.
 *
 * Russian by default, because that is what the people using this read. The
 * catalogues are the same three the public site uses, so a panel string and a
 * site string are never translated twice.
 */
export const ADMIN_LOCALE_COOKIE = 'admin_locale';

export const ADMIN_DEFAULT_LOCALE: Locale = 'ru';

/**
 * The cookie is set by a form on the panel, so it should never be anything
 * else — but it arrives from the browser, and it is about to be interpolated
 * into a message-catalogue import. Validated against the configured locales
 * rather than trusted.
 */
export async function readAdminLocale(): Promise<Locale> {
  const value = (await cookies()).get(ADMIN_LOCALE_COOKIE)?.value;
  return hasLocale(routing.locales, value) ? value : ADMIN_DEFAULT_LOCALE;
}
