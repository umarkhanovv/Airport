/**
 * Pinned flights (§17.2).
 *
 * Stored in localStorage and nowhere else. The spec is emphatic that this site
 * has no accounts anywhere, ever — so "your flight" means "this browser's
 * flight", with no sign-in, no record on the server, and nothing to leak.
 *
 * Keys are the flight's natural identity rather than its database id, so a
 * pin survives next week's upload replacing every row: the same flight on the
 * same day at the same time is still the same flight.
 */

export const PINNED_STORAGE_KEY = 'hsa-pinned-flights';

/** How many pins to keep. Generous for a passenger, bounded against abuse. */
const MAX_PINNED = 20;

/** `2024-04-06|arrival|KC7361|00:20` */
export function pinKey(parts: {
  date: string;
  kind: string;
  flightNoNorm: string;
  scheduledTime: string | null;
}): string {
  return [parts.date, parts.kind, parts.flightNoNorm, parts.scheduledTime ?? ''].join('|');
}

export function readPinned(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function writePinned(keys: string[]): void {
  try {
    localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(keys.slice(-MAX_PINNED)));
  } catch {
    // Storage unavailable or full. The pin applies to this page view only,
    // which is a better outcome than an error the visitor cannot act on.
  }
}

export function togglePinned(key: string): string[] {
  const current = readPinned();
  const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
  writePinned(next);
  return next;
}
