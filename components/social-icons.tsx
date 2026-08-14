import { AIRPORT_CONTACTS } from '@/lib/constants';

/**
 * The airport's social accounts, as icons.
 *
 * The accounts themselves are not new — they have been in the JSON-LD as
 * `sameAs` since Stage 9, and spelled out in words on the contacts page. What
 * was missing was the one place people actually look for them, which is the
 * bottom of the page.
 *
 * Glyphs are drawn here rather than fetched: three marks is not worth an icon
 * font or a sprite request, and inline paths inherit `currentColor`, so they
 * follow the theme instead of needing a second asset for dark mode.
 *
 * Each link carries the account's name for a screen reader — an unlabelled
 * `<svg>` in a link is an anonymous link — and opens in a new tab, which is
 * the one place on this site that is the right behaviour: leaving for an
 * external network should not lose the timetable you were reading.
 */

type IconProps = { className?: string };

const GLYPHS: Record<string, (props: IconProps) => React.ReactElement> = {
  Instagram: (props) => (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17.2" cy="6.8" r="1.2" fill="currentColor" />
    </svg>
  ),
  Facebook: (props) => (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M13.5 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.25-1.5 1.55-1.5h1.65V3.6c-.29-.04-1.27-.13-2.41-.13-2.39 0-4.02 1.46-4.02 4.13V9.9H7.5V13h2.77v8h3.23Z"
        fill="currentColor"
      />
    </svg>
  ),
  X: (props) => (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M17.4 3h3.1l-6.8 7.7L21.8 21h-6.3l-4.9-6.4L4.9 21H1.8l7.3-8.3L1.5 3h6.4l4.4 5.9L17.4 3Zm-1.1 16.1h1.7L7.8 4.8H6l10.3 14.3Z"
        fill="currentColor"
      />
    </svg>
  ),
};

export function SocialIcons() {
  return (
    <ul className="-ms-2 flex flex-wrap items-center gap-1">
      {AIRPORT_CONTACTS.social.map((account) => {
        const Glyph = GLYPHS[account.name];
        return (
          <li key={account.name}>
            <a
              href={account.url}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={account.name}
              className="social-link"
            >
              {Glyph ? <Glyph className="h-5 w-5" /> : account.name}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
