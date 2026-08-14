import { useTranslations } from 'next-intl';

import { AIRPORT_CONTACTS } from '@/lib/constants';

import { SocialIcons } from './social-icons';

/**
 * The call centre number and e-mail are here as well as on the contacts page,
 * as they were on the legacy site: a passenger looking for a phone number
 * should not have to work out which section it is filed under.
 *
 * What is no longer here: a column of quick links, which repeated four of the
 * seven destinations already in the header on every page, and the airport's
 * coordinates as raw decimals — `43.30965, 68.54065` is not something anybody
 * reads off a footer, and the contacts page has an actual map. The social
 * accounts take their place, which is where people look for them.
 */
export function SiteFooter() {
  const t = useTranslations('Footer');
  const tContacts = useTranslations('Contacts');

  return (
    <footer className="border-border bg-surface-raised mt-20 border-t">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2">
        <div>
          <p className="text-text font-semibold">{t('rights')}</p>

          {/*
            The landline and the airport's own address only. The contacts page
            carries all of them; a footer that repeats five ways to make contact
            on every page is a footer nobody reads.
          */}
          <p className="mt-3 text-sm">
            <span className="text-text-muted">{tContacts('callCentre')}: </span>
            <a
              href={`tel:${AIRPORT_CONTACTS.phones[0].tel}`}
              className="tabular text-brand-text-strong focus:ring-focus rounded-sm underline focus:ring-2 focus:outline-none"
            >
              {AIRPORT_CONTACTS.phones[0].label}
            </a>
          </p>
          <p className="text-sm">
            <a
              href={`mailto:${AIRPORT_CONTACTS.emails[0]}`}
              className="text-brand-text-strong focus:ring-focus rounded-sm underline focus:ring-2 focus:outline-none"
            >
              {AIRPORT_CONTACTS.emails[0]}
            </a>
          </p>

          <p className="text-text-muted mt-4 text-xs">
            © {new Date().getFullYear()} {t('rights')}
          </p>
        </div>

        <div>
          <h2 className="text-text text-sm font-semibold">{tContacts('social')}</h2>
          <div className="mt-2">
            <SocialIcons />
          </div>
        </div>
      </div>
    </footer>
  );
}
