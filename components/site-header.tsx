import { useTranslations } from 'next-intl';

import { SECTIONS } from '@/lib/constants';
import { Link } from '@/i18n/navigation';

import { AppearancePanel } from './appearance-panel';
import { LocaleSwitcher } from './locale-switcher';
import { Logo } from './logo';

export function SiteHeader() {
  const t = useTranslations('Nav');

  return (
    <header className="border-border bg-surface sticky top-0 z-40 border-b">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex items-center gap-4 py-3">
          <Logo />
          <div className="ms-auto flex items-center gap-2">
            <LocaleSwitcher />
            <AppearancePanel />
          </div>
        </div>

        {/*
          Horizontally scrollable rather than collapsed behind a hamburger.
          Seven destinations is few enough to show, and a visible row beats a
          menu someone in a hurry has to discover — especially on the phones
          this audience actually carries.
        */}
        <nav aria-label={t('label')} className="-mx-4 overflow-x-auto px-4">
          <ul className="flex min-w-max gap-1 pb-2">
            {SECTIONS.map((section) => (
              <li key={section}>
                <Link
                  href={`/${section}`}
                  className="text-text-muted hover:text-text hover:bg-surface-sunken block rounded-md px-3 py-1.5 text-sm whitespace-nowrap"
                >
                  {t(section)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
