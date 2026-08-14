import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { readAdminLocale } from '@/lib/admin/locale';

import { AdminLocaleSwitcher } from './locale-switcher';
import { logout } from './login/actions';

/**
 * Admin chrome.
 *
 * Plain `next/link`, not the localised `@/i18n/navigation` wrapper — the admin
 * tree sits outside the locale segment, so the i18n Link would prefix every
 * href with a language and 404. The panel's language lives in a cookie
 * instead; the switcher is at the end of this bar.
 */

const SECTION_PATHS = {
  dashboard: '/admin',
  schedule: '/admin/schedule',
  news: '/admin/news',
  documents: '/admin/documents',
  feedback: '/admin/feedback',
} as const;

export async function AdminNav({
  current,
  unreadFeedback = 0,
  back,
}: {
  current: keyof typeof SECTION_PATHS;
  unreadFeedback?: number;
  /**
   * Where the language switcher should return to. Defaults to the section
   * root, which is right for every screen that is one; the two that sit deeper
   * pass their own path so switching language does not also navigate.
   */
  back?: string;
}) {
  const locale = await readAdminLocale();
  const t = await getTranslations({ locale, namespace: 'Admin.nav' });

  const linkClass = (active: boolean) =>
    active
      ? 'text-text font-medium'
      : 'text-text-muted hover:text-text hover:bg-surface-sunken rounded-md';

  return (
    <header className="glass-strong sticky top-0 z-30 border-x-0 border-t-0">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <span className="font-semibold">{t('brand')}</span>

        <nav aria-label={t('sections')} className="flex items-center gap-1 text-sm">
          {(Object.keys(SECTION_PATHS) as Array<keyof typeof SECTION_PATHS>).map((section) => (
            <Link
              key={section}
              href={SECTION_PATHS[section]}
              className={`px-3 py-1.5 ${linkClass(current === section)}`}
            >
              {t(section)}
              {section === 'feedback' && unreadFeedback > 0 ? (
                <span
                  data-testid="unread-badge"
                  className="bg-brand text-on-brand ms-1.5 rounded-full px-1.5 py-0.5 text-xs font-medium"
                >
                  {unreadFeedback}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-3">
          <AdminLocaleSwitcher locale={locale} back={back ?? SECTION_PATHS[current]} />

          <form action={logout}>
            <button
              type="submit"
              className="text-text-muted hover:text-text focus:ring-focus rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:outline-none"
            >
              {t('signOut')}
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
