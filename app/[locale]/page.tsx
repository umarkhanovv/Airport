import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { FlightPreview } from '@/components/flight-preview';
import { SECTIONS } from '@/lib/constants';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';

/**
 * The flight data changes weekly, but "today" changes daily and the page must
 * never be stale about which day it is. Sixty seconds keeps the page cacheable
 * — so it is fast on the slow connections this audience is on — while staying
 * accurate to the minute.
 */
export const revalidate = 60;

export default async function HomePage({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('Home');
  const tSite = await getTranslations('Site');
  const tSections = await getTranslations('Sections');

  return (
    <>
      {/*
        The masthead is type, not photography. Not because we lack a photograph
        — there is a good one further down — but because this audience is on a
        weak connection and in a hurry, and the fastest possible first paint is
        worth more to them than an image (plan §9.2).

        The lattice behind it is the terminal's own perforated façade geometry,
        held at 7% so it reads as texture rather than pattern.
      */}
      <section className="relative isolate overflow-hidden">
        <div aria-hidden="true" className="lattice absolute inset-0 -z-10" />
        <div className="py-10 sm:py-14">
          <p className="text-brand-text-strong text-sm font-semibold tracking-[0.14em] uppercase">
            {tSite('location')}
          </p>
          <h1 className="text-text mt-3 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            {t('title')}
          </h1>
          <p className="text-text-muted mt-4 max-w-xl text-lg">{t('intro')}</p>
        </div>
      </section>

      <FlightPreview locale={locale as Locale} />

      <section className="mt-16">
        <h2 className="text-text text-2xl font-semibold tracking-tight">{t('sectionsHeading')}</h2>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((section) => (
            <li key={section}>
              <Link
                href={`/${section}`}
                className="border-border bg-surface hover:border-brand hover:bg-surface-raised block h-full rounded-lg border p-5 transition-colors"
              >
                <span className="text-text block font-semibold">
                  {tSections(`${section}.title`)}
                </span>
                <span className="text-text-muted mt-1 block text-sm">
                  {tSections(`${section}.description`)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/*
        The photograph earns its place here rather than at the top: below the
        fold, lazy-loaded, and never the LCP element.
      */}
      <section className="mt-16">
        <figure className="border-border overflow-hidden rounded-xl border">
          <Image
            src="/media/terminal-dusk.jpg"
            alt={t('terminalPhotoAlt')}
            width={1280}
            height={720}
            sizes="(min-width: 1024px) 1024px, 100vw"
            loading="lazy"
            className="h-auto w-full"
          />
          <figcaption className="bg-surface-raised text-text-muted px-5 py-3 text-sm">
            {t('terminalPhotoCaption')}
          </figcaption>
        </figure>
      </section>
    </>
  );
}
