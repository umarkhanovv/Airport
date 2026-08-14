'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { DOCUMENT_TYPES } from '@/lib/documents/types';

import { uploadDocuments, type DocumentsState } from './actions';

const INITIAL: DocumentsState = {};

const FIELD_CLASS =
  'border-border-strong bg-surface focus:ring-focus rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none';

const FORMATS = Object.keys(DOCUMENT_TYPES)
  .map((extension) => extension.replace('.', '').toUpperCase())
  .join(', ');

/**
 * Uploading files onto a page.
 *
 * Many at once, because the airport adds procurement notices in batches — a
 * form that took one at a time would be used once and then worked around. Each
 * file's title defaults to its filename and is edited in the list below, which
 * is faster than filling in thirty titles before anything is saved.
 */
export function UploadForm({
  pages,
  today,
}: {
  pages: Array<{ path: string; title: string }>;
  /** Today at the airport, computed on the server — see `PostForm`, same trap. */
  today: string;
}) {
  const [state, action, pending] = useActionState(uploadDocuments, INITIAL);
  const t = useTranslations('Admin.documents');

  return (
    <form action={action} encType="multipart/form-data" className="mt-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pagePath" className="text-sm font-medium">
            {t('page')}
          </label>
          <select id="pagePath" name="pagePath" required className={FIELD_CLASS}>
            {pages.map((page) => (
              <option key={page.path} value={page.path}>
                {page.title} — /{page.path}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="publishedAt" className="text-sm font-medium">
            {t('date')}
          </label>
          <input
            id="publishedAt"
            name="publishedAt"
            type="date"
            defaultValue={today}
            className={FIELD_CLASS}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="files" className="text-sm font-medium">
          {t('files')}
        </label>
        <input
          id="files"
          name="files"
          type="file"
          multiple
          required
          accept={Object.keys(DOCUMENT_TYPES).join(',')}
          aria-describedby="files-hint"
          className={FIELD_CLASS}
        />
        <p id="files-hint" className="text-text-muted text-xs">
          {t('filesHint', { formats: FORMATS })}
        </p>
      </div>

      {state.errorKey ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {t(state.errorKey)}
        </p>
      ) : null}

      {state.uploaded ? (
        <p role="status" className="text-sm">
          {t('uploaded', { count: state.uploaded })}
        </p>
      ) : null}

      {state.rejected ? (
        <div role="alert" className="text-sm text-red-700 dark:text-red-400">
          <p>{t('notUploaded')}</p>
          <ul className="mt-1 list-disc ps-5">
            {state.rejected.map((rejection) => (
              <li key={`${rejection.key}-${rejection.params.filename}`}>
                {t(rejection.key, rejection.params)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="bg-brand text-on-brand focus:ring-focus self-start rounded-md px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:opacity-60"
      >
        {pending ? t('uploading') : t('upload')}
      </button>
    </form>
  );
}
