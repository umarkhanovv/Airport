'use server';

import { hasLocale } from 'next-intl';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { assertSameOrigin } from '@/lib/admin/auth';
import { ADMIN_LOCALE_COOKIE } from '@/lib/admin/locale';
import { routing } from '@/i18n/routing';

/**
 * Switches the panel's language.
 *
 * A form post and a redirect rather than a client-side setter, for two
 * reasons. The panel works with scripting off everywhere else and this is not
 * the control to make an exception for; and a layout does not re-render on
 * client navigation, so the `<html lang>` and the provider above every screen
 * would go on holding the old language until something forced a document load.
 * The redirect is that document load.
 *
 * Not behind `requireAdmin()`. The switcher only appears once signed in, but
 * choosing a language reveals nothing and reads nothing — bouncing an
 * unauthenticated request to the login screen would only mean the login screen
 * itself could never be switched.
 */
export async function setAdminLocale(formData: FormData): Promise<void> {
  await assertSameOrigin();

  const requested = formData.get('locale');
  const back = formData.get('back');

  if (typeof requested === 'string' && hasLocale(routing.locales, requested)) {
    (await cookies()).set(ADMIN_LOCALE_COOKIE, requested, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/admin',
      // A preference, not a session: it should outlive signing out, so the
      // next person to reach the login screen gets the language the last one
      // chose rather than the default.
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  // Same-origin admin paths only, so a crafted `back` cannot turn a language
  // button into an open redirect — the same rule as the login `?next=`.
  const destination =
    typeof back === 'string' && back.startsWith('/admin') && !back.startsWith('//')
      ? back
      : '/admin';

  redirect(destination);
}
