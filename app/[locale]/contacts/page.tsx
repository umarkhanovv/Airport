import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { FeedbackForm } from '@/components/feedback-form';
import { LocationMap } from '@/components/location-map';
import { EOTINISH_URL } from '@/lib/constants';
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
 * Addresses and phone numbers arrive with the content migration in Stage 8.
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
  const tFeedback = await getTranslations('Feedback');
  const tPlaceholder = await getTranslations('Placeholder');

  return (
    <div>
      <h1 className="text-text text-3xl font-semibold tracking-tight sm:text-4xl">
        {t('contacts.title')}
      </h1>
      <p className="text-text-muted mt-3 max-w-2xl text-lg">{t('contacts.description')}</p>

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
        Rendered only once the legacy site's own eOtinish URL has been copied
        across in Stage 8. Guessing the address of a government appeals service
        would be worse than omitting the link (see lib/constants.ts).
      */}
      {EOTINISH_URL ? (
        <section className="border-border bg-surface-raised mt-8 max-w-3xl rounded-lg border p-5">
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

      <div className="border-border bg-surface-raised mt-8 max-w-3xl rounded-lg border p-5">
        <p className="text-text font-medium">{tPlaceholder('underConstruction')}</p>
        <p className="text-text-muted mt-1 text-sm">{tPlaceholder('explanation')}</p>
      </div>
    </div>
  );
}
