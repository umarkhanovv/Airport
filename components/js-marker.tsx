/**
 * Marks the document as scripted, before first paint.
 *
 * Progressive enhancements hide their no-JS fallbacks off this class rather
 * than off React state, so there is no flash and no hydration-detection effect:
 * `:root.js [data-no-js-only]` and `:root:not(.js) [data-js-only]` in
 * `app/globals.css` decide what to show before React has loaded at all.
 *
 * This was `ThemeScript`, and most of it read a saved theme out of localStorage
 * and applied the class before paint so a dark-theme reader never saw a white
 * flash. There is one theme now, so all of that is gone and what remains is the
 * single line that was never about theming.
 *
 * It stays an inline script in <head> for the same reason it always was: it has
 * to run ahead of React, and it must not cost a request.
 */
const script = `document.documentElement.classList.add('js');`;

export function JsMarker() {
  return <script dangerouslySetInnerHTML={{ __html: script }} suppressHydrationWarning />;
}
