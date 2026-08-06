'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Flight search (§17.1) — priority feature, and a progressive enhancement.
 *
 * Without JavaScript this is a plain GET form: type, press the button, and the
 * server filters via `?q=`. With JavaScript the button is hidden by CSS and
 * rows are filtered in place as you type, with no request at all.
 *
 * Filtering targets the server-rendered rows through a `data-search` attribute
 * rather than re-rendering a client-side copy of the list. That keeps the board
 * server-rendered, which is a requirement rather than an optimisation: the
 * default view has to work with zero JavaScript.
 *
 * The DOM is the external system here, so the effect writes to it directly —
 * including the live-region text. Mirroring the count into React state would
 * add a render pass for something React does not own.
 */
export function BoardSearch({
  defaultValue,
  hiddenParams,
}: {
  defaultValue: string;
  /**
   * Current tab, view and filter, carried as hidden fields.
   *
   * Without these, submitting with JavaScript disabled would drop every other
   * parameter and bounce the visitor back to the default board, losing the
   * filter they just set.
   */
  hiddenParams: Record<string, string>;
}) {
  const t = useTranslations('Board');
  const [value, setValue] = useState(defaultValue);
  const liveRef = useRef<HTMLParagraphElement>(null);
  const inputId = useId();

  useEffect(() => {
    const needle = value.trim().toLowerCase();
    const rows = document.querySelectorAll<HTMLElement>('[data-flight-row]');
    let visible = 0;

    for (const row of rows) {
      const hit = needle === '' || (row.dataset.search ?? '').includes(needle);
      row.hidden = !hit;
      if (hit) visible += 1;
    }

    // A day heading in the week view must disappear when nothing under it
    // matched, or the board shows a date with no flights beneath it.
    for (const heading of document.querySelectorAll<HTMLElement>('.board-day')) {
      let next = heading.nextElementSibling as HTMLElement | null;
      let any = false;
      while (next && !next.classList.contains('board-day')) {
        if (!next.hidden) any = true;
        next = next.nextElementSibling as HTMLElement | null;
      }
      heading.hidden = !any;
    }

    if (liveRef.current) {
      liveRef.current.textContent =
        needle === ''
          ? ''
          : visible === 0
            ? t('searchNoResults')
            : t('searchResults', { count: visible });
    }
  }, [value, t]);

  return (
    <form method="get" role="search" className="w-full sm:max-w-xs">
      {Object.entries(hiddenParams).map(([name, val]) => (
        <input key={name} type="hidden" name={name} value={val} />
      ))}

      <label htmlFor={inputId} className="text-text mb-1 block text-sm font-medium">
        {t('searchLabel')}
      </label>

      <div className="flex gap-2">
        <input
          id={inputId}
          type="search"
          name="q"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={t('searchPlaceholder')}
          autoComplete="off"
          className="border-border-strong bg-surface text-text w-full rounded-md border px-3 py-2 text-base"
        />
        {/* Present in the markup for browsers without scripting; hidden by CSS
            the moment the inline head script marks the document as scripted. */}
        <button
          type="submit"
          data-no-js-only=""
          className="bg-brand text-on-brand rounded-md px-3 py-2 text-sm font-semibold"
        >
          {t('searchSubmit')}
        </button>
      </div>

      {/* Announced as the count changes, so the effect of typing is
          perceivable without seeing rows disappear. */}
      <p ref={liveRef} aria-live="polite" className="text-text-muted mt-1 min-h-5 text-sm" />
    </form>
  );
}
