'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { AIRPORT_COORDS } from '@/lib/constants';

/**
 * Location map, as a click-to-load facade (plan §6.6).
 *
 * The legacy `/airport-map/` page embeds a live Google Maps iframe. Carried
 * over as-is that costs several hundred kilobytes of third-party JavaScript
 * and sets third-party cookies before the visitor has agreed to anything —
 * on a page we fully control, for information that is one static image.
 *
 * So: nothing third-party loads until someone asks for it. The default view is
 * a self-hosted static map, and the three outbound links cover how people here
 * actually navigate — Yandex and 2GIS matter more than Google inside
 * Kazakhstan, and the legacy site offered neither.
 */

const { latitude: lat, longitude: lon } = AIRPORT_COORDS;

const LINKS = [
  { key: 'google' as const, href: `https://www.google.com/maps/search/?api=1&query=${lat},${lon}` },
  { key: 'yandex' as const, href: `https://yandex.ru/maps/?pt=${lon},${lat}&z=15&l=map` },
  { key: 'twogis' as const, href: `https://2gis.kz/geo/${lon},${lat}` },
];

export function LocationMap() {
  const t = useTranslations('Map');
  const [interactive, setInteractive] = useState(false);

  return (
    <section className="glass overflow-hidden rounded-xl">
      <div className="relative">
        {interactive ? (
          <iframe
            title={t('interactiveTitle')}
            src={`https://www.google.com/maps?q=${lat},${lon}&hl=ru&z=14&output=embed`}
            className="block h-[320px] w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : (
          <div className="bg-surface-sunken relative flex h-[320px] items-center justify-center">
            {/* A schematic rather than a tile screenshot: it needs no third
                party, no attribution, and stays legible in both themes and at
                high contrast. */}
            <svg
              viewBox="0 0 400 200"
              className="absolute inset-0 h-full w-full"
              aria-hidden="true"
              preserveAspectRatio="xMidYMid slice"
            >
              <g stroke="var(--border-strong)" strokeWidth="1" fill="none" opacity="0.6">
                <path d="M0 130 H400" />
                <path d="M150 0 V200" />
                <path d="M-20 60 L420 100" />
              </g>
              <circle cx="200" cy="96" r="26" fill="var(--brand)" opacity="0.14" />
              <circle cx="200" cy="96" r="7" fill="var(--brand)" />
            </svg>

            <div className="bg-surface/85 border-border relative rounded-lg border px-4 py-3 text-center backdrop-blur-sm">
              <p className="text-text font-semibold">{t('airportLabel')}</p>
              <p className="tabular text-text-muted mt-0.5 text-sm">
                {lat.toFixed(5)}, {lon.toFixed(5)}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="border-border flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-5 py-3">
        {!interactive && (
          <button
            type="button"
            onClick={() => setInteractive(true)}
            className="text-brand-text-strong text-sm font-medium hover:underline"
          >
            {t('showInteractive')}
          </button>
        )}
        {LINKS.map((link) => (
          <a
            key={link.key}
            href={link.href}
            target="_blank"
            rel="noreferrer noopener"
            className="text-text-muted hover:text-brand-text text-sm hover:underline"
          >
            {t(link.key)}
          </a>
        ))}
      </div>

      {interactive && <p className="text-text-muted px-5 pb-3 text-xs">{t('thirdPartyNote')}</p>}
    </section>
  );
}
