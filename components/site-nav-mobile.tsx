import { useTranslations } from 'next-intl';

import { NAVIGATION } from '@/lib/navigation';
import { Link } from '@/i18n/navigation';

/**
 * The menu on a phone.
 *
 * There was not one. The desktop row of pills rendered at every width, and
 * opening Пассажирам on a 375px screen produced four headings and eighteen
 * links stacked in a single column — more than a thousand pixels of menu
 * standing between the visitor and the page they came for. It behaved like a
 * bookshelf: everything on display, all the time.
 *
 * So: three lines, and behind them a tree. `<details name="nav-mobile">` on
 * each section makes the browser itself close one branch when another opens,
 * so exactly one is ever expanded and the drawer stays roughly a screen tall
 * whatever you tap.
 *
 * Same mechanism as the desktop panels, and the same promise with it — no
 * JavaScript is involved in opening anything here. On a weak connection the
 * menu is usable before any script arrives, which is the whole reason this
 * site is built on `<details>` rather than on state.
 */
export function SiteNavMobile() {
  const t = useTranslations('Menu');
  const tNav = useTranslations('Nav');

  return (
    <nav aria-label={t('label')} data-testid="nav-mobile" className="md:hidden">
      <details className="group">
        <summary className="nav-toggle" aria-label={tNav('menu')}>
          <span aria-hidden="true" className="nav-bars">
            <span />
            <span />
            <span />
          </span>
        </summary>

        <div data-testid="nav-drawer" className="nav-drawer-panel">
          <ul className="mx-auto max-w-6xl px-2 py-2">
            {NAVIGATION.map((item) =>
              item.kind === 'link' ? (
                <li key={item.key}>
                  <Link href={item.href} className="nav-row">
                    {t(item.key)}
                  </Link>
                </li>
              ) : (
                <li key={item.key}>
                  {/*
                    The shared `name` is what makes this a tree rather than a
                    list of everything: opening one section closes the last.
                  */}
                  <details name="nav-mobile" className="group/branch">
                    <summary className="nav-row">
                      {t(item.key)}
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 12 12"
                        className="size-3 shrink-0 transition-transform group-open/branch:rotate-180"
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

                    <div className="nav-branch-body">
                      {item.groups.map((group) => (
                        /*
                          A third level, because the second was still a wall.
                          Opening Пассажирам used to render four headings and
                          eighteen links at once; now it renders four rows.

                          The `name` is scoped to this branch. Reusing
                          `nav-mobile` would make a group and its own parent
                          members of the same exclusive accordion, so opening
                          the group would close the branch containing it — the
                          menu would shut as you reached into it.
                        */
                        <details
                          key={group.key}
                          name={`nav-group-${item.key}`}
                          className="group/leaf"
                        >
                          <summary className="nav-group-row">
                            <h2 className="menu-group-title">{t(group.key)}</h2>
                            <svg
                              aria-hidden="true"
                              viewBox="0 0 12 12"
                              className="size-3 shrink-0 transition-transform group-open/leaf:rotate-180"
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

                          <ul className="nav-leaf-body">
                            {group.links.map((link) => (
                              <li key={link.key}>
                                <Link href={link.href} className="nav-sub-link">
                                  {t(link.key)}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ))}

                      {/* Every branch also opens onto its own section index —
                          the legacy menu predates a fifth of the content tree. */}
                      <Link
                        href={item.href}
                        className="nav-sub-link text-brand-text-strong mt-2 underline underline-offset-2"
                      >
                        {t('allPages')}
                      </Link>
                    </div>
                  </details>
                </li>
              )
            )}
          </ul>
        </div>
      </details>
    </nav>
  );
}
