/**
 * The theme preference, as an external store.
 *
 * localStorage genuinely is an external store, so this is read through
 * `useSyncExternalStore` rather than copied into state inside an effect. That
 * keeps server and client render consistent, and it means the theme changed in
 * one tab takes effect in the others.
 *
 * This used to carry a text scale and a high-contrast switch as well, behind an
 * "Aa Вид" panel. The panel is gone in favour of a single button. The contrast
 * palette itself survives in `app/globals.css`, answering `prefers-contrast`
 * rather than a control — somebody who has told their operating system they
 * need more contrast should not have to find a second switch here and say it
 * again.
 */

export const THEME_STORAGE_KEY = 'hsa-appearance';

export type Theme = 'system' | 'light' | 'dark';

export interface Preferences {
  theme: Theme;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
};

/** The order the button cycles through, starting from whatever is current. */
export const THEMES: readonly Theme[] = ['system', 'light', 'dark'];

export function nextTheme(current: Theme): Theme {
  return THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
}

const listeners = new Set<() => void>();

/** The raw serialized string, so snapshots compare by value and never loop. */
function readRaw(): string {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function handleStorage(event: StorageEvent) {
  if (event.key === THEME_STORAGE_KEY) {
    applyPreferences(parsePreferences(readRaw()));
    listeners.forEach((listener) => listener());
  }
}

export function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener('storage', handleStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', handleStorage);
  };
}

export const getSnapshot = readRaw;

/** The server has no preferences; defaults render, then the client corrects. */
export const getServerSnapshot = () => '';

export function parsePreferences(raw: string): Preferences {
  if (!raw) return DEFAULT_PREFERENCES;
  try {
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    /*
     * Only `theme` is read back, and only if it is one we still recognise.
     * Anyone who used the old panel has `contrast` and `fontScale` sitting in
     * their localStorage; both are dropped here rather than migrated, so a
     * stale value cannot resurrect a control that no longer exists.
     */
    const theme = parsed.theme;
    return THEMES.includes(theme as Theme) ? { theme: theme as Theme } : DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function applyPreferences(prefs: Preferences): void {
  const root = document.documentElement;
  root.classList.toggle('theme-dark', prefs.theme === 'dark');
  root.classList.toggle('theme-light', prefs.theme === 'light');
}

export function savePreferences(prefs: Preferences): void {
  applyPreferences(prefs);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage unavailable (private mode). The change still applies to this
    // page view; it just will not persist.
  }
  listeners.forEach((listener) => listener());
}
