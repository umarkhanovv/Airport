import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { LocationMap } from '@/components/location-map';
import { routing } from '@/i18n/routing';

/**
 * Contacts (spec §5.7).
 *
 * This is where the location map lives. On the legacy site the only map sat on
 * an orphaned "Карта аэропорта" page, so the contacts page could not actually
 * tell anyone where the airport is (plan §1.2).
 *
 * Addresses, phone numbers and the eOtinish link arrive with the content
 * migration in Stage 8; the feedback form itself is Stage 7.
 */

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(props: PageProps<'/[locale]/contacts'>): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: 'Sections' });
  return { title: t('contacts.title'), description: t('contacts.description') };
}

export default async function ContactsPage({ params }: PageProps<'/[locale]/contacts'>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('Sections');
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

      <div className="border-border bg-surface-raised mt-8 max-w-3xl rounded-lg border p-5">
        <p className="text-text font-medium">{tPlaceholder('underConstruction')}</p>
        <p className="text-text-muted mt-1 text-sm">{tPlaceholder('explanation')}</p>
      </div>
    </div>
  );
}
