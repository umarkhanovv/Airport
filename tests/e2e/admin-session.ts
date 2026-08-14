import path from 'node:path';

import type { BrowserContext } from '@playwright/test';

/**
 * Where the shared admin session is stored.
 *
 * A plain module rather than an export from `auth.setup.ts`, because Playwright
 * refuses to let one test file import another — and both the setup and the
 * specs that reuse the session need this path.
 */
export const ADMIN_STORAGE_STATE = path.join(__dirname, '../../.auth/admin.json');

export const ADMIN_PASSWORD = 'e2e-admin-password';

/** The cookie `lib/admin/locale.ts` reads to decide the panel's language. */
export const ADMIN_LOCALE_COOKIE = 'admin_locale';

/**
 * Pins the panel to one language for the duration of a test.
 *
 * The panel defaults to Russian, which is what the staff using it read. These
 * specs assert English, and that is a deliberate choice rather than laziness:
 * an assertion is a description of behaviour, and one written in a language
 * the whole team reads survives being read six months from now. What matters
 * is that the *default* is exercised too, and one test in `admin.spec.ts` does
 * exactly that — it clears this cookie and checks the panel comes back in
 * Russian, then switches with the button and checks it follows.
 *
 * Set on the context before the first navigation, so even the login screen —
 * which nobody is signed in to — renders in the language being asserted.
 */
export async function useEnglishAdmin(context: BrowserContext, baseURL?: string): Promise<void> {
  const host = new URL(baseURL ?? 'http://127.0.0.1').hostname;

  await context.addCookies([
    { name: ADMIN_LOCALE_COOKIE, value: 'en', domain: host, path: '/admin' },
  ]);
}
