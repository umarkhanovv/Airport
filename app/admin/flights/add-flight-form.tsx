import { getTranslations } from 'next-intl/server';

import { readAdminLocale } from '@/lib/admin/locale';
import { AIRLINE_NONE, KNOWN_AIRLINES } from '@/lib/flights/airlines';
import type { FlightKind } from '@/lib/flights/types';

import { addFlightAction } from './actions';

/**
 * A flight the workbook does not contain.
 *
 * Folded into a `<details>` so it does not compete with the flights that are
 * actually running — adding one is the rare case, correcting one is the common
 * case. It stays a real disclosure element rather than a scripted toggle, so it
 * opens with scripting off.
 *
 * Only the number is required. Everything else is optional for the same reason
 * the workbook's own columns are: the board renders an unknown as an unknown
 * rather than refusing the flight, and somebody adding a flight in a hurry
 * should not be blocked on the aircraft type.
 */
export async function AddFlightForm({
  date,
  kind,
  invalidField,
}: {
  date: string;
  kind: FlightKind;
  invalidField: string | null;
}) {
  const locale = await readAdminLocale();
  const t = await getTranslations({ locale, namespace: 'Admin.flights' });

  const id = `add-${kind}`;
  const fieldClass =
    'border-border-strong bg-surface focus:ring-focus w-full rounded-md border px-2 py-1.5 text-sm focus:ring-2 focus:outline-none';

  return (
    <details className="panel mt-3 p-4" open={invalidField !== null}>
      <summary className="cursor-pointer text-sm font-medium">
        {kind === 'arrival' ? t('addArrival') : t('addDeparture')}
      </summary>

      <form action={addFlightAction} className="mt-4 grid gap-3 sm:grid-cols-3">
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="kind" value={kind} />

        <div>
          <label htmlFor={`${id}-flightNo`} className="text-text mb-1 block text-xs font-medium">
            {t('fieldFlightNo')}
          </label>
          <input
            id={`${id}-flightNo`}
            name="flightNo"
            type="text"
            required
            placeholder="KC 7361"
            autoComplete="off"
            aria-invalid={invalidField === 'flightNo' || undefined}
            aria-describedby={invalidField === 'flightNo' ? `${id}-error` : undefined}
            className={fieldClass}
          />
        </div>

        <div>
          <label htmlFor={`${id}-city`} className="text-text mb-1 block text-xs font-medium">
            {kind === 'arrival' ? t('fieldOrigin') : t('fieldDestination')}
          </label>
          <input
            id={`${id}-city`}
            name="city"
            type="text"
            placeholder="ASTANA"
            autoComplete="off"
            className={fieldClass}
          />
        </div>

        <div>
          <label
            htmlFor={`${id}-scheduledTime`}
            className="text-text mb-1 block text-xs font-medium"
          >
            {t('fieldScheduled')}
          </label>
          <input
            id={`${id}-scheduledTime`}
            name="scheduledTime"
            type="text"
            inputMode="numeric"
            placeholder="17:40"
            autoComplete="off"
            aria-invalid={invalidField === 'scheduledTime' || undefined}
            className={fieldClass}
          />
        </div>

        <div>
          <label htmlFor={`${id}-aircraft`} className="text-text mb-1 block text-xs font-medium">
            {t('fieldAircraft')}
          </label>
          <input
            id={`${id}-aircraft`}
            name="aircraft"
            type="text"
            placeholder="A320"
            autoComplete="off"
            className={fieldClass}
          />
        </div>

        <div>
          <label htmlFor={`${id}-traffic`} className="text-text mb-1 block text-xs font-medium">
            {t('fieldTraffic')}
          </label>
          <select id={`${id}-traffic`} name="traffic" defaultValue="" className={fieldClass}>
            <option value="">{t('trafficUnknown')}</option>
            <option value="dom">{t('trafficDomestic')}</option>
            <option value="int">{t('trafficInternational')}</option>
          </select>
        </div>

        <div>
          <label htmlFor={`${id}-airline`} className="text-text mb-1 block text-xs font-medium">
            {t('fieldAirline')}
          </label>
          {/* Left alone, the number decides — so adding `KC 999` gets Air
              Astana without anybody choosing it. */}
          <select id={`${id}-airline`} name="airline" defaultValue="" className={fieldClass}>
            <option value="">{t('airlineFromNumber')}</option>
            {KNOWN_AIRLINES.map((airline) => (
              <option key={airline.code} value={airline.code}>
                {airline.name}
              </option>
            ))}
            <option value={AIRLINE_NONE}>{t('airlineNone')}</option>
          </select>
        </div>

        <div>
          <label htmlFor={`${id}-note`} className="text-text mb-1 block text-xs font-medium">
            {t('fieldNote')}
          </label>
          <input
            id={`${id}-note`}
            name="note"
            type="text"
            maxLength={200}
            autoComplete="off"
            className={fieldClass}
          />
        </div>

        {invalidField ? (
          <p
            id={`${id}-error`}
            role="alert"
            className="text-brand-text-strong text-sm sm:col-span-3"
          >
            {invalidField === 'flightNo'
              ? t('errorFlightNo')
              : invalidField === 'airline'
                ? t('errorAirline')
                : t('errorTime')}
          </p>
        ) : null}

        <div className="sm:col-span-3">
          <button
            type="submit"
            className="bg-brand text-on-brand focus:ring-focus rounded-md px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-offset-2 focus:outline-none"
          >
            {t('add')}
          </button>
        </div>
      </form>
    </details>
  );
}
