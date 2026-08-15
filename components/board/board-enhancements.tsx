'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';

import { readPinned, togglePinned } from '@/lib/pinned';

/**
 * Client-side board extras: pinning (§17.2), sharing (§17.3) and weather
 * (§11.2).
 *
 * Deliberately a behaviour layer over server-rendered markup rather than a
 * React rendering of the board. The rows already exist in the HTML — that is
 * what makes the board work without JavaScript — so this attaches listeners by
 * delegation and manipulates the DOM, which is the honest description of what
 * it does. Re-rendering the table on the client would mean shipping every
 * flight twice and giving up the zero-JS guarantee.
 *
 * Every part of this is optional. If it throws, fails to load or the network
 * is gone, the board is exactly the board.
 */

interface WeatherReading {
  cityKey: string;
  temperatureC: number;
  code: number;
  isDay: boolean;
}

/** WMO weather codes, collapsed to the few groups worth showing at a glance. */
function weatherGlyph(code: number): string {
  if (code === 0) return '☀';
  if (code <= 3) return '⛅';
  if (code <= 48) return '🌫';
  if (code <= 67) return '🌧';
  if (code <= 77) return '❄';
  if (code <= 82) return '🌧';
  if (code <= 86) return '❄';
  return '⛈';
}

export function BoardEnhancements() {
  const t = useTranslations('Board');

  // --- retiring flights that have gone ------------------------------------
  useEffect(() => {
    /*
     * The server already dropped everything more than half an hour past its
     * slot when it rendered (`lib/flights/current.ts`). This does it again, in
     * the browser, for the two cases the server cannot reach:
     *
     *   - the page is left open. Someone checks the board at 17:00 and looks
     *     back at 18:30; without this they are reading 17:00's board.
     *   - the page is cached. `/` and `/flights` are ISR pages with
     *     `revalidate = 60`, which is a floor, not a ceiling: a visitor
     *     arriving after a quiet spell is served the last copy that was built
     *     and *then* triggers the rebuild. That copy can be an hour old.
     *
     * Each row carries `data-expires-at`, an epoch millisecond value resolved
     * from airport wall-clock time on the server. So this compares two numbers
     * and never has to know what timezone anybody is in — including a reader
     * whose own device clock is set wrong, whose flights are still retired on
     * schedule because the deadline came from the server.
     *
     * Rows without the attribute are left alone: that is the week view, a
     * chosen date, a search result, and any flight the workbook gave no time.
     */
    const boards = [...document.querySelectorAll<HTMLElement>('[data-live-board]')];
    if (boards.length === 0) return;

    function sweep() {
      const now = Date.now();

      for (const board of boards) {
        for (const row of board.querySelectorAll<HTMLElement>('[data-expires-at]')) {
          const deadline = Number(row.dataset.expiresAt);
          if (Number.isFinite(deadline) && deadline <= now) row.setAttribute('data-retired', '');
        }

        const left = board.querySelectorAll('[data-flight-row]:not([data-retired])').length;
        // Reveals "no more flights today", which is in the HTML from the start
        // precisely so this moment does not leave an empty table behind.
        board.toggleAttribute('data-board-exhausted', left === 0);

        // Only a count this board can actually prove. On `/flights` the other
        // direction's rows are not on the page, so its tab keeps the server's
        // number rather than being given a made-up one.
        const direction = board.dataset.direction;
        if (direction) {
          const label = document.querySelector(`[data-board-count="${direction}"]`);
          if (label) label.textContent = String(left);
        }
      }
    }

    sweep();

    /*
     * Half a minute against a half-hour grace: fine-grained enough that
     * the board is never visibly wrong, coarse enough to be free. The
     * visibility listener is the one that matters on a phone, where a
     * backgrounded tab's timers are throttled to nothing — the sweep that
     * counts is the one when the screen comes back on.
     */
    const timer = window.setInterval(sweep, 30_000);
    document.addEventListener('visibilitychange', sweep);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', sweep);
    };
  }, []);

  // --- pinning ------------------------------------------------------------
  useEffect(() => {
    /*
     * Plural, because the home page now renders both directions at once and
     * shows one with CSS. This used to hold a single `tbody` and prepend every
     * pinned row into it — which with two boards on a page would have lifted a
     * pinned departure out of the departures table and dropped it into
     * arrivals. Each row is re-parented into its own table below instead.
     */
    if (document.querySelector('table.board tbody') === null) return;

    function paint(pinned: string[]) {
      const rows = document.querySelectorAll<HTMLElement>('[data-flight-row]');

      for (const row of rows) {
        const key = row.dataset.pinKey ?? '';
        const isPinned = pinned.includes(key);
        row.toggleAttribute('data-pinned', isPinned);

        const button = row.querySelector<HTMLButtonElement>('[data-pin-toggle]');
        if (button) {
          button.setAttribute('aria-pressed', String(isPinned));
          button.title = isPinned ? t('unpin') : t('pin');
        }
      }

      /**
       * Pinned flights move to the top, which is what §17.2 asks for.
       *
       * In the week view that separates a row from its day heading, so a
       * pinned row also reveals its own date — otherwise "10:30" at the top of
       * the board would be dangerously ambiguous about which day it is.
       */
      const pinnedRows = [...rows].filter((row) => row.hasAttribute('data-pinned'));
      for (const row of pinnedRows.reverse()) {
        row.closest('tbody')?.prepend(row);
      }
    }

    function onClick(event: MouseEvent) {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-pin-toggle]');
      if (!button) return;
      event.preventDefault();
      paint(togglePinned(button.dataset.pinToggle ?? ''));
    }

    paint(readPinned());
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [t]);

  // --- share --------------------------------------------------------------
  useEffect(() => {
    async function onClick(event: MouseEvent) {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-share]');
      if (!button) return;
      event.preventDefault();

      const text = button.dataset.share ?? '';
      const url = window.location.href;

      try {
        if (navigator.share) {
          await navigator.share({ title: text, text, url });
          return;
        }
        await navigator.clipboard.writeText(`${text} — ${url}`);
        announce(t('sharedToClipboard'));
      } catch {
        // Includes the user simply dismissing the share sheet, which is not an
        // error and must not produce one.
      }
    }

    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [t]);

  // --- weather ------------------------------------------------------------
  useEffect(() => {
    // Fires after paint, so the flight times are already on screen. Weather
    // never delays them (spec §11.2).
    const controller = new AbortController();

    async function load() {
      const rows = document.querySelectorAll<HTMLElement>('[data-flight-row]');
      const cities = [...new Set([...rows].map((r) => r.dataset.cityKey).filter(Boolean))];
      if (cities.length === 0) return;

      try {
        const response = await fetch(
          `/api/weather?cities=${encodeURIComponent(cities.join(','))}`,
          {
            signal: controller.signal,
          }
        );
        if (!response.ok) return;

        const { readings } = (await response.json()) as { readings: WeatherReading[] };
        const byCity = new Map(readings.map((r) => [r.cityKey, r]));

        for (const row of rows) {
          const reading = byCity.get(row.dataset.cityKey ?? '');
          const cell = row.querySelector('.board-city');
          if (!reading || !cell || cell.querySelector('[data-weather]')) continue;

          const badge = document.createElement('span');
          badge.dataset.weather = '';
          badge.className = 'board-weather';
          badge.textContent = `${weatherGlyph(reading.code)} ${reading.temperatureC}°`;
          badge.title = t('weatherIn', { city: cell.textContent?.trim() ?? '' });
          cell.appendChild(badge);
        }
      } catch {
        // Offline, blocked, timed out, or the shape changed. The board does not
        // care and neither does the visitor.
      }
    }

    load();
    return () => controller.abort();
  }, [t]);

  return null;
}

/** Transient screen-reader announcement, removed once spoken. */
function announce(message: string) {
  const node = document.createElement('p');
  node.setAttribute('role', 'status');
  node.className = 'sr-only';
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 3000);
}
