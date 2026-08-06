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
   *  - `/_next/*`    — build output
   *  - `/_vercel/*`  — never used here (we self-host), excluded for safety
   *  - anything containing a dot (`favicon.ico`, `/uploads/schedule.xlsx`, …)
   */
  matcher: '/((?!api|admin|_next|_vercel|.*\\..*).*)',
};
