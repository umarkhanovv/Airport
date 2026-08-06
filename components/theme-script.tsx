import { THEME_STORAGE_KEY } from '@/lib/appearance';

/**
 * Applies saved appearance preferences before first paint.
 *
 * This must run synchronously in <head>, ahead of React, or someone who chose
 * the dark theme gets a white flash on every navigation — actively unpleasant
 * for the light-sensitive users the accessibility panel exists to serve.
 *
 * Deliberately tiny, dependency-free and wrapped in try/catch: if localStorage
 * is unavailable the site falls back to the system preference rather than
 * breaking.
 */
const script = `
(function () {
  // Marks the document as scripted, before paint. Progressive enhancements
  // hide their no-JS fallbacks off this class rather than off React state, so
  // there is no flash and no hydration-detection effect.
  document.documentElement.classList.add('js');
  try {
    var raw = localStorage.getItem('${THEME_STORAGE_KEY}');
    if (!raw) return;
    var p = JSON.parse(raw);
    var root = document.documentElement;
    if (p.theme === 'dark') root.classList.add('theme-dark');
    if (p.theme === 'light') root.classList.add('theme-light');
    if (p.contrast === 'high') root.classList.add('contrast-high');
    if (p.fontScale && p.fontScale !== 1) root.style.setProperty('--font-scale', String(p.fontScale));
  } catch (e) {}
})();
`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} suppressHydrationWarning />;
}
