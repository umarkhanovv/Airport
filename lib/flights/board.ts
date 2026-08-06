import type { FlightKind } from './types.ts';

/**
 * Board state, derived entirely from the URL (Stage 3).
 *
 * Every control on the board — tab, view, filter — is a real link that changes
 * these parameters, so the whole thing works with JavaScript disabled and each
 * view is a shareable, bookmarkable URL. Search is the one exception: it
 * submits as a GET form without JS, and filters in place with it.
 */

export type BoardView = 'today' | 'week';
export type TrafficFilter = 'all' | 'dom' | 'int';

export interface BoardState {
  kind: FlightKind;
  view: BoardView;
  /** Explicit day, when the visitor picked one from the week view. */
  date: string | null;
  traffic: TrafficFilter;
  query: string;
}

export const BOARD_PARAMS = {
  kind: 'kind',
  view: 'view',
  date: 'date',
  traffic: 'type',
  query: 'q',
} as const;

const KINDS: Record<string, FlightKind> = {
  arrivals: 'arrival',
  departures: 'departure',
};

/** URL-facing name for a direction: `?kind=arrivals`, not `?kind=arrival`. */
export function kindParam(kind: FlightKind): 'arrivals' | 'departures' {
  return kind === 'arrival' ? 'arrivals' : 'departures';
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseBoardState(params: Record<string, string | string[] | undefined>): BoardState {
  const read = (key: string): string => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
  };

  const date = read(BOARD_PARAMS.date);
  const traffic = read(BOARD_PARAMS.traffic);

  return {
    // Arrivals first, matching the order the spec writes the tabs in (§6.4).
    kind: KINDS[read(BOARD_PARAMS.kind)] ?? 'arrival',
    view: read(BOARD_PARAMS.view) === 'week' ? 'week' : 'today',
    date: ISO_DATE.test(date) ? date : null,
    traffic: traffic === 'dom' || traffic === 'int' ? traffic : 'all',
    // Capped: this string is echoed back into the input, and an unbounded
    // value would be both a rendering problem and pointless as a search.
    query: read(BOARD_PARAMS.query).slice(0, 60),
  };
}

/** `true` = international only, `false` = domestic only, `null` = everything. */
export function trafficToIntl(traffic: TrafficFilter): boolean | null {
  if (traffic === 'int') return true;
  if (traffic === 'dom') return false;
  return null;
}

/** Builds a board URL, preserving current state except for the given changes. */
export function boardHref(state: BoardState, changes: Partial<BoardState>): string {
  const next = { ...state, ...changes };
  const params = new URLSearchParams();

  if (next.kind !== 'arrival') params.set(BOARD_PARAMS.kind, kindParam(next.kind));
  if (next.view !== 'today') params.set(BOARD_PARAMS.view, next.view);
  if (next.date) params.set(BOARD_PARAMS.date, next.date);
  if (next.traffic !== 'all') params.set(BOARD_PARAMS.traffic, next.traffic);
  if (next.query) params.set(BOARD_PARAMS.query, next.query);

  const search = params.toString();
  return search ? `/flights?${search}` : '/flights';
}

/**
 * A single haystack per flight for the search box (§17.1).
 *
 * Built once on the server and written to a data attribute, so filtering never
 * needs the flight data shipped to the client a second time. Includes the
 * whitespace-stripped flight number, so "KC7163" finds "KC 7163".
 */
export function searchHaystack(parts: {
  flightNo: string;
  flightNoNorm: string;
  cityRaw: string;
  cityNames: string[];
}): string {
  return [parts.flightNo, parts.flightNoNorm, parts.cityRaw, ...parts.cityNames]
    .join(' ')
    .toLowerCase();
}
