import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { SectionPages } from '@/components/section-pages';
import { isSection, SECTIONS } from '@/lib/constants';
import { listPagesInSection } from '@/lib/content';
import { routing } from '@/i18n/routing';
import { alternatesFor } from '@/lib/seo';
import type { Locale } from '@/i18n/routing';

/**
 * The index of one of the seven top-level IA sections (spec §5).
 *
 * It lists the section's pages — and until now it did not. It rendered a
 * placeholder written in Stage 2, while Stage 8 filled `content/` with 52 pages
 * per language underneath it and nothing was ever changed to link to them. A
 * page reachable only by typing its address is indistinguishable, to a visitor,
 * from a page that does not exist.
 *
 * Pages the airport has still to write are listed too, marked. Someone looking
 * for the police desk is better served by "that page is here and its text is
 * coming" than by a section that appears not to cover it at all.
 *
 * The seven known sections are prerendered by `generateStaticParams`; anything
 * else falls through to the `isSection` guard and renders the localised 404.
 * `dynamicParams = false` is deliberately not set: it would also 404, but with
 * no fallback to render Next logs an internal error on every miss, which would
 * fill the airport's logs with noise from the ~246 legacy links being
 * redirected (plan §7).
 */

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => SECTIONS.map((section) => ({ locale, section })));
}

export async function generateMetadata(props: PageProps<'/[locale]/[section]'>): Promise<Metadata> {
  const { locale, section } = await props.params;
  if (!isSection(section)) return {};

  const t = await getTranslations({ locale, namespace: 'Sections' });
  return {
    title: t(`${section}.title`),
    description: t(`${section}.description`),
    alternates: alternatesFor(locale as Locale, `/${section}`),
  };
}

export default async function SectionPage({ params }: PageProps<'/[locale]/[section]'>) {
  const { locale, section } = await params;
  if (!isSection(section)) notFound();

  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'Sections' });
  const tPlaceholder = await getTranslations({ locale, namespace: 'Placeholder' });

  const pages = listPagesInSection(locale, section);

  return (
    <div>
      <h1 className="text-text text-3xl font-semibold tracking-tight sm:text-4xl">
        {t(`${section}.title`)}
      </h1>
      <p className="text-text-muted mt-3 max-w-2xl text-lg">{t(`${section}.description`)}</p>

      {pages.length === 0 ? (
        <div className="glass mt-10 max-w-2xl rounded-xl p-5">
          <p className="text-text font-medium">{tPlaceholder('underConstruction')}</p>
          <p className="text-text-muted mt-1 text-sm">{tPlaceholder('explanation')}</p>
        </div>
      ) : (
        <SectionPages locale={locale} section={section} className="mt-10" />
      )}
    </div>
  );
}
