'use client';

import { useLocale, useTranslations } from 'next-intl';

import { LOCALES, LOCALE_LABELS } from '@/i18n/routing';
import { Link, usePathname } from '@/i18n/navigation';

/**
 * Plain anchors, one per locale — no JavaScript required to switch language,
 * and each target is a real, crawlable URL. A <select> would need JS to work
 * and would hide the alternates from search engines.
 */
export function LocaleSwitcher() {
  const active = useLocale();
  const pathname = usePathname();
  const t = useTranslations('Nav');

  return (
    <nav aria-label={t('languageLabel')}>
      <ul className="flex items-center gap-2 text-sm">
        {LOCALES.map((locale) => {
          const isActive = locale === active;
          return (
            <li key={locale}>
              <Link
                href={pathname}
                locale={locale}
                lang={locale}
                hrefLang={locale}
                aria-current={isActive ? 'true' : undefined}
                className={
                  isActive
                    ? 'text-text rounded-sm font-semibold'
                    : 'text-text-muted hover:text-brand-text rounded-sm hover:underline'
                }
              >
                {LOCALE_LABELS[locale]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
