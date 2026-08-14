import { getTranslations } from 'next-intl/server';

import { boardHref, type BoardState, type TrafficFilter } from '@/lib/flights/board';
import { Link } from '@/i18n/navigation';
import type { FlightKind } from '@/lib/flights/types';

/**
 * Board tabs and filters.
 *
 * Every control is a `<Link>`, not a button with an onClick, so the board works
 * with JavaScript disabled and every view is a shareable URL. This is a server
 * component; the board ships no JavaScript for navigation at all.
 */

export async function BoardControls({
  state,
  counts,
  compact = false,
}: {
  state: BoardState;
  counts: { arrival: number; departure: number };
  /**
   * Direction tabs only, no view or traffic filters.
   *
   * For the home page, which shows today's flights and nothing else. Because
   * `boardHref` always writes `/flights`, both tabs there lead to the full
   * board with that direction already selected — which is the intended
   * journey: glance at the home page, tap through when you want more than a
   * glance.
   */
  compact?: boolean;
}) {
  const t = await getTranslations('Board');

  const tabs: Array<{ kind: FlightKind; label: string; count: number }> = [
    // Arrivals first, matching the order the spec writes them in (§6.4). The
    // labels are the point: the legacy site had "Вылет" linking to
    // /incoming-flights/ and "Прилёт" to /outbound-flights/.
    { kind: 'arrival', label: t('arrivals'), count: counts.arrival },
    { kind: 'departure', label: t('departures'), count: counts.departure },
  ];

  const traffic: Array<{ value: TrafficFilter; label: string }> = [
    { value: 'all', label: t('trafficAll') },
    { value: 'dom', label: t('domestic') },
    { value: 'int', label: t('international') },
  ];

  return (
    <div className="space-y-4">
      <nav aria-label={t('directionLabel')}>
        <ul className="border-border flex gap-1 border-b">
          {tabs.map((tab) => {
            const active = state.kind === tab.kind;
            const accent =
              tab.kind === 'arrival'
                ? 'border-arrival text-arrival'
                : 'border-brand text-brand-text-strong';
            return (
              <li key={tab.kind}>
                <Link
                  href={boardHref(state, { kind: tab.kind })}
                  aria-current={active ? 'page' : undefined}
                  className={[
                    '-mb-px block border-b-2 px-4 py-2.5 text-base font-semibold transition-colors',
                    active
                      ? accent
                      : 'text-text-muted hover:text-text border-transparent hover:border-[var(--border-strong)]',
                  ].join(' ')}
                >
                  {tab.label}
                  <span className="tabular text-text-muted ms-2 text-sm font-normal">
                    {tab.count}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Not hidden with a class — not rendered. A filter that is present in
          the DOM but invisible is still something a script or a stylesheet can
          bring back by accident, and on the home page these controls have
          nothing to filter. */}
      {compact ? null : (
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <fieldset>
            <legend className="text-text mb-1 text-sm font-medium">{t('viewLabel')}</legend>
            <div className="border-border-strong flex overflow-hidden rounded-md border">
              {(['today', 'week'] as const).map((view) => (
                <Link
                  key={view}
                  href={boardHref(state, { view, date: null })}
                  aria-current={state.view === view && !state.date ? 'true' : undefined}
                  className={[
                    'px-3 py-1.5 text-sm',
                    state.view === view && !state.date
                      ? 'bg-brand text-on-brand font-semibold'
                      : 'bg-surface text-text hover:bg-surface-sunken',
                  ].join(' ')}
                >
                  {view === 'today' ? t('viewToday') : t('viewWeek')}
                </Link>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-text mb-1 text-sm font-medium">{t('trafficLabel')}</legend>
            <div className="border-border-strong flex overflow-hidden rounded-md border">
              {traffic.map((option) => (
                <Link
                  key={option.value}
                  href={boardHref(state, { traffic: option.value })}
                  aria-current={state.traffic === option.value ? 'true' : undefined}
                  className={[
                    'px-3 py-1.5 text-sm',
                    state.traffic === option.value
                      ? 'bg-brand text-on-brand font-semibold'
                      : 'bg-surface text-text hover:bg-surface-sunken',
                  ].join(' ')}
                >
                  {option.label}
                </Link>
              ))}
            </div>
          </fieldset>
        </div>
      )}
    </div>
  );
}
