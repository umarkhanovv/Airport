'use client';

import { useTranslations } from 'next-intl';

import { deleteNewsPostAction } from '../actions';

/**
 * Deletion, with the headline typed back to confirm it.
 *
 * There is no soft delete and no undo — the row goes, and its cover image with
 * it. A bare "are you sure?" is clicked through without being read, so the
 * confirmation asks for something only someone looking at the right post can
 * produce. The check is repeated on the server; this is the convenience half.
 */
export function DeleteForm({
  id,
  title,
  mismatch,
}: {
  id: string;
  title: string;
  mismatch: boolean;
}) {
  const t = useTranslations('Admin.news');

  return (
    <form action={deleteNewsPostAction} className="mt-4 flex flex-col items-start gap-3">
      <input type="hidden" name="id" value={id} />

      <label htmlFor="confirmTitle" className="text-sm">
        {t('confirmTitle')} <strong>{title}</strong>
      </label>
      <input
        id="confirmTitle"
        name="confirmTitle"
        type="text"
        required
        autoComplete="off"
        aria-invalid={mismatch ? true : undefined}
        aria-describedby={mismatch ? 'confirm-error' : undefined}
        className="border-border-strong bg-surface focus:ring-focus w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
      />

      {mismatch ? (
        <p id="confirm-error" role="alert" className="text-sm text-red-700 dark:text-red-400">
          {t('confirmMismatch')}
        </p>
      ) : null}

      <button
        type="submit"
        className="focus:ring-focus rounded-md border border-red-700 px-4 py-2 text-sm font-medium text-red-700 focus:ring-2 focus:outline-none dark:border-red-400 dark:text-red-400"
      >
        {t('deleteButton')}
      </button>
    </form>
  );
}
