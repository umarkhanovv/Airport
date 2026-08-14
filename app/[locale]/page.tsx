import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { FlightPreview } from '@/components/flight-preview';
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

  return (
    <>
      {/*
        The masthead is type, not photography. Not because we lack a photograph
        — there is a good one further down — but because this audience is on a
        weak connection and in a hurry, and the fastest possible first paint is
        worth more to them than an image (plan §9.2).

        Smaller than it was, too. It ran to text-6xl, which made the airport's
        own name three times the weight of the departure times underneath it —
        the wrong thesis for this page. Nobody arrives wondering what the
        airport is called. The name still comes first, because it is how a
        visitor confirms they are in the right place, and it stops competing.

        The façade lattice that used to be a layer of this section now runs the
        whole page, in `.app-backdrop`.
      */}
      <section className="relative isolate">
        <div className="py-8 sm:py-10">
          <p className="text-brand-text-strong text-sm font-semibold tracking-[0.14em] uppercase">
            {tSite('location')}
          </p>
          <h1 className="text-text mt-2 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
            {t('title')}
          </h1>
          <p className="text-text-muted mt-3 max-w-xl">{t('intro')}</p>
        </div>
      </section>

      <FlightPreview locale={locale as Locale} />

      {/*
        There was a grid of seven section tiles here, headed "Разделы сайта".
        It was the site map printed twice: every one of those destinations is in
        the header on every page, and repeating them under the board made the
        home page a menu with a timetable at the top rather than a timetable.

        The photograph earns its place here rather than at the top: below the
        fold, lazy-loaded, and never the LCP element. Its caption is gone —
        explaining the façade pattern to someone checking a departure time was
        a note about the design, addressed to nobody who came here. The `alt`
        text stays, because that is not a caption; it is what the picture is,
        for a reader who cannot see it.
      */}
      <section className="mt-16">
        <figure className="panel overflow-hidden">
          <Image
            src="/media/terminal-dusk.jpg"
            alt={t('terminalPhotoAlt')}
            width={1280}
            height={720}
            sizes="(min-width: 1024px) 1024px, 100vw"
            loading="lazy"
            className="h-auto w-full"
          />
        </figure>
      </section>
    </>
  );
}
