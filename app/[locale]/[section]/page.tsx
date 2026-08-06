import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { isSection, SECTIONS } from '@/lib/constants';
import { routing } from '@/i18n/routing';

/**
 * Placeholder pages for the seven top-level IA sections (spec §5), so the
 * navigation shell resolves in all three locales without 404s.
 *
 * The seven known sections are prerendered by `generateStaticParams`. Anything
 * else falls through to the `isSection` guard below and renders the localised
 * 404 page.
 *
 * We deliberately do NOT set `dynamicParams = false` here. It would 404 too,
 * but with no fallback to render Next logs an internal `NoFallbackError` on
 * every miss — which would fill the airport's production logs with noise for
 * ordinary bad URLs, and there will be plenty of those from the ~246 legacy
 * links being redirected (plan §7).
 *
 * As real routes arrive (Stage 3 `/flights`, Stage 5 `/news`, …) their static
 * segments take precedence over this dynamic one, so no cleanup is needed —
 * the placeholders simply stop being reached.
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
  };
}

export default async function SectionPage({ params }: PageProps<'/[locale]/[section]'>) {
  const { locale, section } = await params;
  if (!isSection(section)) notFound();

  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'Sections' });
  const tPlaceholder = await getTranslations({ locale, namespace: 'Placeholder' });

  return (
    <div className="max-w-2xl">
      <h1 className="text-text text-3xl font-semibold tracking-tight sm:text-4xl">
        {t(`${section}.title`)}
      </h1>
      <p className="text-text-muted mt-3 text-lg">{t(`${section}.description`)}</p>

      <div className="border-border bg-surface-raised mt-10 rounded-lg border p-5">
        <p className="text-text font-medium">{tPlaceholder('underConstruction')}</p>
        <p className="text-text-muted mt-1 text-sm">{tPlaceholder('explanation')}</p>
      </div>
    </div>
  );
}
