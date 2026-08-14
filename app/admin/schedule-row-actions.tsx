import { getTranslations } from 'next-intl/server';

import { readAdminLocale } from '@/lib/admin/locale';

import { deleteScheduleAction, setActiveScheduleAction } from './schedule/actions';

/**
 * What staff can do to a published schedule, from the history table.
 *
 * Three actions with deliberately different weights. Making a schedule live and
 * taking it off the board are single buttons with no confirmation, because
 * either is undone by pressing the other — they are how you correct a mistaken
 * publish, and putting a dialog in front of a reversible action only teaches
 * people to dismiss dialogs.
 *
 * Deleting asks for the week to be typed back, and the answer is checked on the
 * server. It is the only irreversible thing here: the row goes, its flights go
 * with it through the cascade, and the workbook is unlinked from the volume.
 *
 * Plain server-action forms throughout — no dialog, no client state, no
 * `confirm()`. The admin panel works without JavaScript and this is not the
 * place to stop.
 */
export async function ScheduleRowActions({
  id,
  isActive,
  weekStart,
  mismatch,
}: {
  id: string;
  isActive: boolean;
  weekStart: string | null;
  mismatch: boolean;
}) {
  const t = await getTranslations({
    locale: await readAdminLocale(),
    namespace: 'Admin.dashboard',
  });

  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
      {isActive ? (
        <form action={setActiveScheduleAction}>
          {/* Empty id is the "nothing live" case the action reads deliberately. */}
          <input type="hidden" name="id" value="" />
          <button
            type="submit"
            className="border-border-strong text-text hover:bg-surface-sunken focus:ring-focus rounded-md border px-2.5 py-1 text-xs font-medium focus:ring-2 focus:outline-none"
          >
            {t('takeOff')}
          </button>
        </form>
      ) : (
        <form action={setActiveScheduleAction}>
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            className="border-border-strong text-text hover:bg-surface-sunken focus:ring-focus rounded-md border px-2.5 py-1 text-xs font-medium focus:ring-2 focus:outline-none"
          >
            {t('makeLive')}
          </button>
        </form>
      )}

      <form action={deleteScheduleAction} className="flex flex-wrap items-start gap-2">
        <input type="hidden" name="id" value={id} />
        <div>
          <label htmlFor={`confirm-${id}`} className="sr-only">
            {t('confirmWeek', { week: weekStart ?? '' })}
          </label>
          <input
            id={`confirm-${id}`}
            name="confirmWeek"
            required
            placeholder={weekStart ?? ''}
            aria-invalid={mismatch || undefined}
            aria-describedby={mismatch ? `confirm-error-${id}` : undefined}
            className="border-border-strong bg-surface focus:ring-focus w-28 rounded-md border px-2 py-1 text-xs focus:ring-2 focus:outline-none"
          />
          {mismatch ? (
            <p
              id={`confirm-error-${id}`}
              role="alert"
              className="text-brand-text-strong mt-1 text-xs"
            >
              {t('confirmMismatch')}
            </p>
          ) : null}
        </div>
        <button
          type="submit"
          className="border-brand text-brand-text-strong hover:bg-surface-sunken focus:ring-focus rounded-md border px-2.5 py-1 text-xs font-medium focus:ring-2 focus:outline-none"
        >
          {t('delete')}
        </button>
      </form>
    </div>
  );
}
