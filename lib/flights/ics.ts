import { zonedWallClockToUtc } from '../date.ts';
import type { FlightKind } from './types.ts';

/**
 * Calendar export (§17.3).
 *
 * Generated here rather than through any external service — the spec forbids
 * third parties, and a calendar file is a few hundred bytes of text.
 *
 * The event is the scheduled time and nothing else. No check-in window, no
 * "arrive two hours early": the airport has not told us those numbers, and
 * inventing them on a page that also promises never to fake flight status
 * would be exactly the wrong kind of helpful.
 */

export interface IcsFlight {
  kind: FlightKind;
  /** `YYYY-MM-DD` */
  date: string;
  /** `HH:MM`, airport-local wall clock. */
  scheduledTime: string;
  flightNo: string;
  city: string;
  airportName: string;
  /** Localised "Arrival"/"Departure" word. */
  directionLabel: string;
  /** Localised "scheduled time" note. */
  scheduledNote: string;
  /** Absolute URL back to the board. */
  url?: string;
}

/** RFC 5545 escaping for TEXT values. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Folds a line to 75 octets, per RFC 5545.
 *
 * Counted in octets, not characters: every city and label here is Cyrillic, so
 * a character-based fold would produce lines over the limit and could split a
 * multi-byte sequence in half.
 */
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const out: string[] = [];
  let current = '';
  let currentBytes = 0;
  // Continuation lines start with a space, which costs one of the 75 octets.
  let limit = 75;

  for (const char of line) {
    const size = encoder.encode(char).length;
    if (currentBytes + size > limit) {
      out.push(current);
      current = '';
      currentBytes = 0;
      limit = 74;
    }
    current += char;
    currentBytes += size;
  }
  if (current) out.push(current);

  return out.join('\r\n ');
}

function formatUtcStamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

/**
 * A calendar entry is a point in time, so the wall-clock string is resolved to
 * a real instant here — the one place in the codebase that does so.
 */
export function buildFlightIcs(flight: IcsFlight, timeZone: string, now = new Date()): string {
  const start = zonedWallClockToUtc(flight.date, flight.scheduledTime, timeZone);
  // One hour is a container for the event, not a claim about the flight.
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  const summary = `${flight.flightNo} · ${flight.directionLabel} — ${flight.city}`;
  const description = [
    `${flight.directionLabel}: ${flight.city}`,
    `${flight.flightNo}`,
    flight.scheduledNote,
  ].join('\n');

  // Stable across regeneration, so re-importing updates rather than duplicates.
  const uid = `${flight.date}-${flight.kind}-${flight.flightNo.replace(/\s+/g, '')}@hsairport.kz`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Turkistan International Airport//Flight Board//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatUtcStamp(now)}`,
    `DTSTART:${formatUtcStamp(start)}`,
    `DTEND:${formatUtcStamp(end)}`,
    `SUMMARY:${escapeText(summary)}`,
    `LOCATION:${escapeText(flight.airportName)}`,
    `DESCRIPTION:${escapeText(description)}`,
    ...(flight.url ? [`URL:${escapeText(flight.url)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  // CRLF throughout, as the spec requires; Outlook is unforgiving about it.
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
