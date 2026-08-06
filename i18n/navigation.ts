import { createNavigation } from 'next-intl/navigation';

import { routing } from './routing';

/**
 * Locale-aware navigation primitives. Always import `Link` from here rather
 * than from `next/link`, so the locale prefix (`/en`, `/kz`) is applied
 * automatically and never hardcoded into an href.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
