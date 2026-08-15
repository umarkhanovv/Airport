import { zonedWallClockToUtc, DEFAULT_AIRPORT_TZ } from '../date.ts';

/**
 * Retiring flights that have already gone (spec §6.4).
 *
 * Someone opening the board at 17:09 wants to know what is still ahead of them.
 * Every row above that line is a row they have to read past, and on a phone
 * that is most of the screen. So a flight leaves the board a short while after
 * its slot.
 *
 * "A short while" rather than "at once" because the times are *scheduled*
 * times, published a week ahead — this site has no live status feed and says so
 * on every table. A flight that pushes back a few minutes late must not vanish
 * from under the person still walking to the gate.
 *
 * Half an hour is a compromise, and it is worth being honest about which way
 * it fails: a flight delayed by longer than that disappears while it is still
 * on the ground. There is no fix for that inside this file — it needs a live
 * feed the airport does not publish. What the grace period buys is that the
 * ordinary case, a flight leaving roughly on time, stays visible until it
 * genuinely cannot be caught, and that the common delays are covered too.
 *
 * It started at fifteen and was widened deliberately. Erring long is the safe
 * direction: a flight shown a little past its time costs a reader one row to
 * scan past, while a flight hidden too early costs them the flight.
 *
 * This module is deliberately pure and free of `server-only`: the same rule has
 * to run in two places. The server applies it when it renders, and the browser
 * re-applies it on a timer, because these pages are cached (`revalidate = 60`)
 * and a visitor arriving at a quiet moment can be served HTML that was built
 * some time ago.
 */

/** How long a flight stays on the board after its scheduled time. */
export const BOARD_GRACE_MINUTES = 30;

/** Minutes past midnight for an `HH:MM` string; `null` if there isn't one. */
function minutesPastMidnight(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
}

/**
 * Has this flight's slot passed, by more than the grace period?
 *
 * Both arguments are airport wall-clock strings for the *same* day, which is
 * what makes the plain comparison safe — the caller only ever asks this about
 * today's flights. A 00:20 arrival belongs to the calendar day it is printed
 * under (see `getFlightsForDate`), so at 00:05 it is correctly still ahead.
 *
 * A flight the workbook gave no time for is never retired. Unknown is not the
 * same as past, and guessing would drop a real flight off the board.
 */
export function hasSlipped(
  scheduledTime: string | null | undefined,
  nowTime: string,
  graceMinutes: number = BOARD_GRACE_MINUTES
): boolean {
  const slot = minutesPastMidnight(scheduledTime);
  const now = minutesPastMidnight(nowTime);
  if (slot === null || now === null) return false;

  return slot + graceMinutes <= now;
}

/**
 * The time this flight is actually going by.
 *
 * Once staff have said when a flight really went — or when they now expect it —
 * that is the time the grace period has to be measured from. Measuring from the
 * scheduled time instead takes a flight somebody has explicitly marked as
 * running late and hides it half an hour after a time everyone already knows is
 * wrong, which is the board using the delay to conceal the delay.
 */
export function effectiveTime(flight: {
  scheduledTime: string | null;
  actualTime?: string | null;
}): string | null {
  return flight.actualTime ?? flight.scheduledTime;
}

/** Today's flights, minus the ones that have gone. Order is preserved. */
export function stillToCome<T extends { scheduledTime: string | null; actualTime?: string | null }>(
  flights: T[],
  nowTime: string,
  graceMinutes: number = BOARD_GRACE_MINUTES
): T[] {
  return flights.filter((flight) => !hasSlipped(effectiveTime(flight), nowTime, graceMinutes));
}

/**
 * The instant a row should leave the board, in epoch milliseconds.
 *
 * Written to each row as a data attribute so the browser can retire it without
 * knowing anything about airports or timezones — it compares one number against
 * `Date.now()`. Resolving the wall clock to a real instant here, on the server,
 * is what makes that correct for a visitor reading the board from Astana, from
 * Istanbul, or with a wrong clock on their laptop.
 *
 * `null` when the flight has no time at all, which is the signal not to write
 * the attribute — and so the signal never to hide the row.
 *
 * Takes the flight rather than a bare time so that it counts from the same
 * moment `stillToCome` does. When these two disagree the board contradicts
 * itself: the server keeps a delayed flight and the browser retires it a minute
 * later, or the reverse.
 */
export function expiresAt(
  date: string,
  flight: { scheduledTime: string | null; actualTime?: string | null },
  timeZone: string = DEFAULT_AIRPORT_TZ,
  graceMinutes: number = BOARD_GRACE_MINUTES
): number | null {
  const time = effectiveTime(flight);
  if (minutesPastMidnight(time) === null) return null;

  const slot = zonedWallClockToUtc(date, time as string, timeZone);
  return slot.getTime() + graceMinutes * 60_000;
}
