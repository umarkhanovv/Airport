import createMiddleware from 'next-intl/middleware';

import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  /**
   * Match every pathname except:
   *  - `/api/*`      — route handlers are not localised
   *  - `/admin/*`    — staff-only, single language, deliberately outside the
   *                    locale tree. Without this exclusion next-intl would
   *                    redirect `/admin` to `/ru/admin`, which does not exist.
   *  - `/offline`    — the service worker's fallback page, for the same reason.
   *                    It is trilingual on one page precisely because there is
   *                    no server to negotiate a language when it is shown, and
   *                    localising it would 404 — which fails the worker's
   *                    install step and silently disables offline support.
   *  - `/_next/*`    — build output
   *  - `/_vercel/*`  — never used here (we self-host), excluded for safety
   *  - anything containing a dot (`favicon.ico`, `/uploads/schedule.xlsx`, …)
   */
  matcher: '/((?!api|admin|offline|_next|_vercel|.*\\..*).*)',
};
