/**
 * Appearance preferences as an external store.
 *
 * localStorage genuinely is an external store, so this is read through
 * `useSyncExternalStore` rather than copied into state inside an effect. That
 * keeps server and client render consistent, and it means a preference changed
 * in one tab takes effect in the others — which matters when the setting is
 * "make the text bigger because I can't read it".
 */

export const THEME_STORAGE_KEY = 'hsa-appearance';

export type Theme = 'system' | 'light' | 'dark';
export type Contrast = 'normal' | 'high';

export interface Preferences {
  theme: Theme;
  contrast: Contrast;
  fontScale: number;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  contrast: 'normal',
  fontScale: 1,
};

export const FONT_SCALES = [1, 1.15, 1.3] as const;

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
    return { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as Partial<Preferences>) };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function applyPreferences(prefs: Preferences): void {
  const root = document.documentElement;
  root.classList.toggle('theme-dark', prefs.theme === 'dark');
  root.classList.toggle('theme-light', prefs.theme === 'light');
  root.classList.toggle('contrast-high', prefs.contrast === 'high');
  root.style.setProperty('--font-scale', String(prefs.fontScale));
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
