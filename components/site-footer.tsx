import { useTranslations } from 'next-intl';

import { AIRPORT_CONTACTS, AIRPORT_COORDS } from '@/lib/constants';
import { Link } from '@/i18n/navigation';

/**
 * The call centre number and e-mail are here as well as on the contacts page,
 * as they were on the legacy site: a passenger looking for a phone number
 * should not have to work out which section it is filed under.
 */
export function SiteFooter() {
  const t = useTranslations('Footer');
  const tNav = useTranslations('Nav');
  const tContacts = useTranslations('Contacts');

  return (
    <footer className="border-border bg-surface-raised mt-20 border-t">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2">
        <div>
          <p className="text-text font-semibold">{t('rights')}</p>
          <p className="tabular text-text-muted mt-1 text-sm">
            {t('coordinates')}: {AIRPORT_COORDS.latitude}, {AIRPORT_COORDS.longitude}
          </p>

          <p className="mt-3 text-sm">
            <span className="text-text-muted">{tContacts('callCentre')}: </span>
            <a
              href={`tel:${AIRPORT_CONTACTS.phone.tel}`}
              className="tabular text-brand-text-strong focus:ring-focus rounded-sm underline focus:ring-2 focus:outline-none"
            >
              {AIRPORT_CONTACTS.phone.label}
            </a>
          </p>
          <p className="text-sm">
            <a
              href={`mailto:${AIRPORT_CONTACTS.email}`}
              className="text-brand-text-strong focus:ring-focus rounded-sm underline focus:ring-2 focus:outline-none"
            >
              {AIRPORT_CONTACTS.email}
            </a>
          </p>

          <p className="text-text-muted mt-4 text-xs">
            © {new Date().getFullYear()} {t('rights')}
          </p>
        </div>

        <nav aria-label={t('quickLinks')}>
          <h2 className="text-text text-sm font-semibold">{t('quickLinks')}</h2>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            {(['flights', 'contacts', 'press', 'passengers'] as const).map((section) => (
              <li key={section}>
                <Link href={`/${section}`} className="text-text-muted hover:text-brand-text">
                  {tNav(section)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
