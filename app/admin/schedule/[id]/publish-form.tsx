'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { discardSchedule, publishStagedSchedule, type PublishState } from '../actions';

const INITIAL: PublishState = {};

export function PublishForm({ stagedId, blocked }: { stagedId: string; blocked: boolean }) {
  const [state, action, pending] = useActionState(publishStagedSchedule, INITIAL);
  const t = useTranslations('Admin.schedule');

  return (
    <div className="mt-8 flex flex-wrap items-center gap-3">
      <form action={action}>
        <input type="hidden" name="id" value={stagedId} />
        <button
          type="submit"
          disabled={pending || blocked}
          className="bg-brand text-on-brand focus:ring-focus rounded-md px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? t('publishing') : t('publish')}
        </button>
      </form>

      <form action={discardSchedule}>
        <input type="hidden" name="id" value={stagedId} />
        <button
          type="submit"
          className="border-border-strong focus:ring-focus rounded-md border px-4 py-2 text-sm focus:ring-2 focus:outline-none"
        >
          {t('discard')}
        </button>
      </form>

      {state.errorKey ? (
        <p role="alert" className="w-full text-sm text-red-700 dark:text-red-400">
          {t(state.errorKey, state.params)}
        </p>
      ) : null}
    </div>
  );
}
