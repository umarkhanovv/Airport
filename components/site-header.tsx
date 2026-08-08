import { useTranslations } from 'next-intl';

import { NAVIGATION } from '@/lib/navigation';
import { Link } from '@/i18n/navigation';

import { AppearancePanel } from './appearance-panel';
import { LocaleSwitcher } from './locale-switcher';
import { Logo } from './logo';

/**
 * The header menu (spec §5), reproducing the legacy site's structure at the
 * airport's request — see `lib/navigation.ts` for what it contains and why.
 *
 * Built on `<details>` and `<summary>` rather than on a click handler, and that
 * is the design rather than a shortcut. The panels open with no JavaScript at
 * all; they sit in the keyboard order and announce their expanded state without
 * a line of ARIA; and they cost nothing against the hydration budget, which a
 * client component holding open/closed state would not. This site's promise is
 * that it works on a bad connection before any script arrives, and navigation
 * is the last thing that should break it.
 *
 * Hover deliberately does not open them. A hover menu cannot be used on the
 * phones this audience carries, and one that opens when a pointer drifts across
 * it is one that opens by accident.
 *
 * The shared `name` makes the panels an exclusive accordion natively: opening
 * one closes the other. Where a browser has not caught up, two can be open at
 * once — untidy, and it works.
 */
export function SiteHeader() {
  const t = useTranslations('Menu');

  return (
    <header className="glass-strong sticky top-0 z-40 border-x-0 border-t-0">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex items-center gap-4 py-3">
          <Logo />
          <div className="ms-auto flex items-center gap-2">
            <LocaleSwitcher />
            <AppearancePanel />
          </div>
        </div>

        {/*
          Visible rather than collapsed behind a hamburger: six destinations is
          few enough to show, and a visible row beats a menu someone in a hurry
          has to discover.
        */}
        <nav aria-label={t('label')}>
          {/*
            Wraps onto a second line rather than scrolling sideways. A scrolling
            row would have to clip its overflow, and an overflow container clips
            the panel that hangs out of it — and on a phone it also made the
            whole document scroll sideways, which the board tests catch.
          */}
          <ul className="flex flex-wrap gap-1 pb-2">
            {NAVIGATION.map((item) =>
              item.kind === 'link' ? (
                <li key={item.key}>
                  <Link href={item.href} className="menu-item block">
                    {t(item.key)}
                  </Link>
                </li>
              ) : (
                <li key={item.key}>
                  <details name="site-menu" className="group">
                    {/*
                      `.menu-summary` hides the browser's own triangle; the
                      chevron beside the label replaces it and turns over when
                      the panel opens.
                    */}
                    <summary className="menu-item menu-summary">
                      {t(item.key)}
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 12 12"
                        className="size-3 transition-transform group-open:rotate-180"
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

                    {/*
                      Full width beneath the header, at every size. A panel that
                      floats beside its own tab has to be measured against the
                      viewport to stay on screen, and measuring takes script.
                    */}
                    {/*
                      Opaque enough not to depend on its own blur. It sits
                      inside the header, which is itself a backdrop-filtered
                      element and therefore the backdrop root for anything in
                      it — so a nested blur would have only the header to
                      frost, not the page hanging below it.
                    */}
                    <div
                      data-testid="menu-panel"
                      className="glass-strong absolute inset-x-0 z-30 border-x-0 border-t-0"
                    >
                      <div className="mx-auto grid max-w-6xl gap-x-8 gap-y-6 px-4 py-6 sm:grid-cols-2 lg:grid-cols-4">
                        {item.groups.map((group) => (
                          <div key={group.key}>
                            <h2 className="menu-group-title">{t(group.key)}</h2>
                            <ul className="menu-group-links">
                              {group.links.map((link) => (
                                <li key={link.key}>
                                  <Link href={link.href} className="menu-link">
                                    {t(link.key)}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>

                      {/*
                        The menu this reproduces predates a fifth of the content
                        tree, so every panel also opens onto its own section
                        index — otherwise those pages would be reachable only by
                        someone who already knew they existed.
                      */}
                      <div className="border-border mx-auto max-w-6xl border-t px-4 py-3">
                        <Link
                          href={item.href}
                          className="menu-link text-brand-text-strong underline underline-offset-2"
                        >
                          {t('allPages')}
                        </Link>
                      </div>
                    </div>
                  </details>
                </li>
              )
            )}
          </ul>
        </nav>
      </div>
    </header>
  );
}
