'use client';

import { useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';

import {
  getServerSnapshot,
  getSnapshot,
  nextTheme,
  parsePreferences,
  savePreferences,
  subscribe,
  type Theme,
} from '@/lib/appearance';

/**
 * One button, cycling system → light → dark → system.
 *
 * This replaces a popover holding three segmented controls — text size, theme,
 * contrast — behind an "Aa Вид" label. Two of the three are gone: text size
 * duplicated a zoom control every browser already has, and contrast now
 * follows `prefers-contrast` in the stylesheet rather than waiting to be found.
 * What is left needs no popover.
 *
 * The icon says which of the three states you are in, not which one the button
 * would take you to — a control that shows its destination is a control nobody
 * can read the current state off. The accessible name carries the same
 * information in words, since sun-versus-moon is not something to make a
 * screen-reader user infer.
 *
 * `useSyncExternalStore` over localStorage rather than state in an effect, so a
 * theme changed in one tab lands in the others and the first render never
 * disagrees with the server's.
 */
export function ThemeToggle() {
  const t = useTranslations('Appearance');

  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const { theme } = parsePreferences(raw);

  return (
    <button
      type="button"
      onClick={() => savePreferences({ theme: nextTheme(theme) })}
      /*
       * Names the current state, not the action. Announced on every press,
       * which is what tells a screen-reader user the press worked.
       */
      aria-label={`${t('theme')}: ${t(theme)}`}
      title={`${t('theme')}: ${t(theme)}`}
      className="chip-button"
    >
      <ThemeIcon theme={theme} />
    </button>
  );
}

/**
 * Sun, moon, and a half-filled disc for "whatever the system says".
 *
 * Drawn inline rather than pulled from an icon font: three glyphs is not worth
 * a download, and these inherit `currentColor` so they follow the theme they
 * describe.
 */
function ThemeIcon({ theme }: { theme: Theme }) {
  if (theme === 'light') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4">
        <circle cx="10" cy="10" r="3.5" fill="currentColor" />
        <path
          d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M15.7 4.3l-1.4 1.4M5.7 14.3l-1.4 1.4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (theme === 'dark') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4">
        <path d="M16 11.5A6.5 6.5 0 0 1 8.5 4a6.5 6.5 0 1 0 7.5 7.5Z" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4">
      <circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {/* The lit half. Half sun, half moon — the conventional mark for "auto". */}
      <path d="M10 3.5a6.5 6.5 0 0 1 0 13Z" fill="currentColor" />
    </svg>
  );
}
