'use client';

import { useLocale, useTranslations } from 'next-intl';

import { LOCALES, LOCALE_LABELS, LOCALE_SHORT_LABELS, type Locale } from '@/i18n/routing';
import { Link, usePathname } from '@/i18n/navigation';

/**
 * One button, showing the language you are reading in.
 *
 * It used to print all three names at once — `Русский English Қазақша`, some
 * twenty-four characters of header at every width, two thirds of it naming
 * languages you are not reading. Now the button says where you are and the
 * other two are a tap away.
 *
 * Still `<details>` and still plain anchors, which is the part that matters:
 * switching language needs no JavaScript, and each alternate stays a real
 * crawlable URL carrying its own `hreflang`. A `<select>` would have needed a
 * script to do anything and would have hidden the alternates from search
 * engines entirely.
 *
 * The visible label is two letters; the accessible name is the language's own
 * name in full, because "KZ" read aloud is not a language.
 */
export function LocaleSwitcher() {
  const active = useLocale() as Locale;
  const pathname = usePathname();
  const t = useTranslations('Nav');

  return (
    <nav aria-label={t('languageLabel')} className="relative">
      <details className="group">
        <summary className="chip-button">
          <span aria-hidden="true">{LOCALE_SHORT_LABELS[active]}</span>
          <span className="sr-only">
            {t('languageLabel')}: {LOCALE_LABELS[active]}
          </span>
          <svg
            aria-hidden="true"
            viewBox="0 0 12 12"
            className="size-2.5 transition-transform group-open:rotate-180"
          >
            <path
              d="M2 4.5 6 8.5 10 4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </summary>

        <ul className="lang-menu">
          {LOCALES.filter((locale) => locale !== active).map((locale) => (
            <li key={locale}>
              <Link
                href={pathname}
                locale={locale}
                lang={locale}
                hrefLang={locale}
                className="lang-option"
              >
                <span aria-hidden="true">{LOCALE_SHORT_LABELS[locale]}</span>
                <span className="sr-only">{LOCALE_LABELS[locale]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </details>
    </nav>
  );
}
