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

        The façade lattice that used to be a layer of this section now runs the
        whole page, in `.app-backdrop` — the frosted surfaces need something
        structured behind them or the blur has nothing to show.
      */}
      {/*
        Smaller than it was, deliberately.

        The masthead used to run to text-6xl, which made the airport's own name
        three times the weight of the departure times underneath it. That is
        the wrong thesis for this page: nobody arrives here wondering what the
        airport is called, they arrive wanting to know when a flight is, and
        the board is the most characteristic thing this site has. The name
        still has to be here — it is how a visitor confirms they are in the
        right place — so it stays first and stays legible, and stops competing.
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

      <section className="mt-16">
        <h2 className="text-text text-2xl font-semibold tracking-tight">{t('sectionsHeading')}</h2>
        {/*
          Seven tiles, not seven equal tiles.

          They were identical, which said that flights matter as much as
          partner tariffs. They do not: the board is why almost everyone is
          here, and a grid that flattens that is making a false claim about the
          content. Flights takes the width of two, which is the whole of the
          hierarchy — no second accent on top of it, because the size is
          already saying it.

          Seven into a 2-up and a 3-up both come out even once the first tile
          is double width, so nothing is left ragged at the end of a row.
        */}
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((section) => (
            <li key={section} className={section === 'flights' ? 'sm:col-span-2' : undefined}>
              <Link href={`/${section}`} className="glass glass-card block h-full p-5">
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
        <figure className="glass overflow-hidden rounded-xl">
          <Image
            src="/media/terminal-dusk.jpg"
            alt={t('terminalPhotoAlt')}
            width={1280}
            height={720}
            sizes="(min-width: 1024px) 1024px, 100vw"
            loading="lazy"
            className="h-auto w-full"
          />
          <figcaption className="text-text-muted border-border border-t px-5 py-3 text-sm">
            {t('terminalPhotoCaption')}
          </figcaption>
        </figure>
      </section>
    </>
  );
}
