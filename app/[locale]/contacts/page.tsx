import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { FeedbackForm } from '@/components/feedback-form';
import { LocationMap } from '@/components/location-map';
import { AIRPORT_CONTACTS, EOTINISH_URL } from '@/lib/constants';
import { issueFormToken } from '@/lib/feedback/antispam';
import { isFeedbackLocale } from '@/lib/feedback/validate';
import { routing } from '@/i18n/routing';
import { alternatesFor } from '@/lib/seo';
import type { Locale } from '@/i18n/routing';

/**
 * Contacts (spec §5.7) and the feedback form (spec §9).
 *
 * This is where the location map lives. On the legacy site the only map sat on
 * an orphaned "Карта аэропорта" page, so the contacts page could not actually
 * tell anyone where the airport is (plan §1.2).
 *
 * Rendered per request rather than prerendered, because the form carries a
 * signed render timestamp for the time-trap. Baked in at build time that
 * timestamp would be months old by the time anyone submitted, and every message
 * would be rejected as stale. Fetching it with client script instead would make
 * JavaScript a requirement for contacting the airport, which is worse.
 *
 * The addresses, telephone numbers and e-mail were recovered from the legacy
 * site's footer in Stage 8 — the legacy contacts page itself never carried them.
 * They lead the page: someone who opens "Contacts" wants a phone number, not a
 * form.
 */

export const dynamic = 'force-dynamic';

export async function generateMetadata(props: PageProps<'/[locale]/contacts'>): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: 'Sections' });
  return {
    title: t('contacts.title'),
    description: t('contacts.description'),
    alternates: alternatesFor(locale as Locale, '/contacts'),
  };
}

export default async function ContactsPage({ params }: PageProps<'/[locale]/contacts'>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('Sections');
  const tContacts = await getTranslations('Contacts');
  const tFeedback = await getTranslations('Feedback');

  return (
    <div>
      <h1 className="text-text text-3xl font-semibold tracking-tight sm:text-4xl">
        {t('contacts.title')}
      </h1>
      <p className="text-text-muted mt-3 max-w-2xl text-lg">{t('contacts.description')}</p>

      <section className="mt-8 max-w-3xl" aria-labelledby="details-heading">
        <h2 id="details-heading" className="text-text text-2xl font-semibold tracking-tight">
          {tContacts('detailsTitle')}
        </h2>

        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-text-muted text-sm">{tContacts('airportAddress')}</dt>
            <dd className="text-text mt-1">{tContacts('airportAddressValue')}</dd>
          </div>
          <div>
            <dt className="text-text-muted text-sm">{tContacts('legalAddress')}</dt>
            <dd className="text-text mt-1">{tContacts('legalAddressValue')}</dd>
          </div>

          <div>
            <dt className="text-text-muted text-sm">{tContacts('callCentre')}</dt>
            {/*
              Every number is a link: on a phone this page is the fastest route
              to a person, and a number that has to be copied out by hand is not.
              `tabular` keeps them from jittering against each other.
            */}
            {AIRPORT_CONTACTS.phones.map((phone) => (
              <dd key={phone.tel} className="mt-1">
                <a
                  href={`tel:${phone.tel}`}
                  className="tabular text-brand-text-strong focus:ring-focus rounded-sm underline focus:ring-2 focus:outline-none"
                >
                  {phone.label}
                </a>
                <span className="text-text-muted text-sm">
                  {' — '}
                  {phone.kind === 'landline' ? tContacts('landlineHint') : tContacts('mobileHint')}
                </span>
              </dd>
            ))}
          </div>

          <div>
            <dt className="text-text-muted text-sm">{tContacts('email')}</dt>
            {AIRPORT_CONTACTS.emails.map((email) => (
              <dd key={email} className="mt-1">
                <a
                  href={`mailto:${email}`}
                  className="text-brand-text-strong focus:ring-focus rounded-sm underline focus:ring-2 focus:outline-none"
                >
                  {email}
                </a>
              </dd>
            ))}
          </div>
        </dl>

        <h3 className="text-text mt-6 text-sm font-semibold">{tContacts('social')}</h3>
        <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
          {AIRPORT_CONTACTS.social.map((account) => (
            <li key={account.name}>
              <a
                href={account.url}
                rel="noopener noreferrer"
                target="_blank"
                className="text-brand-text-strong focus:ring-focus rounded-sm text-sm underline focus:ring-2 focus:outline-none"
              >
                {account.name}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-8 max-w-3xl">
        <LocationMap />
      </div>

      <section className="mt-10 max-w-3xl" aria-labelledby="feedback-heading">
        <h2 id="feedback-heading" className="text-text text-2xl font-semibold tracking-tight">
          {tFeedback('title')}
        </h2>
        <p className="text-text-muted mt-2">{tFeedback('intro')}</p>

        <div className="mt-6">
          <FeedbackForm
            locale={isFeedbackLocale(locale) ? locale : routing.defaultLocale}
            token={issueFormToken()}
          />
        </div>
      </section>

      {/*
        Rendered only when the URL is set. It was left null until the legacy
        site's own link could be copied across, because guessing the address of
        a government appeals service would be worse than omitting it entirely
        (see lib/constants.ts). The guard stays: it is what keeps that rule
        enforced rather than remembered.
      */}
      {EOTINISH_URL ? (
        <section className="panel mt-8 max-w-3xl p-5">
          <h2 className="text-text font-medium">{tFeedback('eotinishTitle')}</h2>
          <p className="text-text-muted mt-1 text-sm">{tFeedback('eotinishBody')}</p>
          <a
            href={EOTINISH_URL}
            rel="noopener noreferrer"
            target="_blank"
            className="text-brand-text-strong focus:ring-focus mt-3 inline-block rounded-sm text-sm font-medium underline focus:ring-2 focus:outline-none"
          >
            {tFeedback('eotinishLink')}
          </a>
        </section>
      ) : null}
    </div>
  );
}
