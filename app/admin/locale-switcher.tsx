import { getTranslations } from 'next-intl/server';

import { LOCALE_SHORT_LABELS, LOCALES, type Locale } from '@/i18n/routing';

import { setAdminLocale } from './actions';

/**
 * The panel's language, as three buttons.
 *
 * Three rather than the collapsed single button the public header uses: that
 * one lives in a crowded row on a phone, and this one sits in a toolbar staff
 * see all day, where showing the choice is worth more than saving the space.
 *
 * Each button is its own submit in one form, so it works with no JavaScript —
 * which is the rule everywhere in this panel, not an accident of implementation.
 * `back` carries the screen the staff member is on so switching language does
 * not also move them; it is checked server-side before being redirected to.
 */
export async function AdminLocaleSwitcher({ locale, back }: { locale: Locale; back: string }) {
  const t = await getTranslations({ locale, namespace: 'Admin.nav' });

  return (
    <form action={setAdminLocale} className="flex items-center gap-0.5">
      <input type="hidden" name="back" value={back} />
      <span className="sr-only" id="admin-language-label">
        {t('language')}
      </span>

      <div
        role="group"
        aria-labelledby="admin-language-label"
        className="border-border-strong flex overflow-hidden rounded-md border"
      >
        {LOCALES.map((candidate) => {
          const active = candidate === locale;
          return (
            <button
              key={candidate}
              type="submit"
              name="locale"
              value={candidate}
              lang={candidate}
              aria-current={active ? 'true' : undefined}
              className={`focus:ring-focus px-2 py-1 text-xs font-medium focus:ring-2 focus:outline-none ${
                active ? 'bg-brand text-on-brand' : 'text-text-muted hover:bg-surface-sunken'
              }`}
            >
              {LOCALE_SHORT_LABELS[candidate]}
            </button>
          );
        })}
      </div>
    </form>
  );
}
