import { LocaleSwitcher } from './locale-switcher';
import { Logo } from './logo';
import { SiteNavDesktop } from './site-nav-desktop';
import { SiteNavMobile } from './site-nav-mobile';
import { ThemeToggle } from './theme-toggle';

/**
 * The masthead: identity on the left, controls on the right, navigation below.
 *
 * The menu itself lives in two components rather than one responsive tree,
 * because the two shapes have almost nothing in common — a row of tabs dropping
 * full-width panels at desktop widths, a hamburger opening a vertical accordion
 * on a phone. See `site-nav-desktop.tsx` and `site-nav-mobile.tsx`; both are
 * built from the same `NAVIGATION` array and both work with no JavaScript.
 *
 * On a phone the hamburger sits in the top row beside the language and theme
 * buttons, so nothing below the masthead is spent on chrome until it is asked
 * for. Above `md` the hamburger disappears and the nav row takes its place.
 */
export function SiteHeader() {
  return (
    <header className="glass-strong sticky top-0 z-40 border-x-0 border-t-0">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex items-center gap-2 py-2 sm:gap-4 sm:py-3">
          <Logo />
          <div className="ms-auto flex items-center gap-1 sm:gap-2">
            <LocaleSwitcher />
            <ThemeToggle />
            <SiteNavMobile />
          </div>
        </div>

        <SiteNavDesktop />
      </div>
    </header>
  );
}
