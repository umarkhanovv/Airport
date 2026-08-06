'use client';

import { useActionState } from 'react';

import { uploadSchedule, type UploadState } from './actions';

const INITIAL: UploadState = {};

export function UploadForm() {
  const [state, action, pending] = useActionState(uploadSchedule, INITIAL);

  return (
    <form action={action} className="mt-4 flex flex-col items-start gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="file" className="text-sm font-medium">
          Weekly schedule workbook (.xlsx, max 5 MB)
        </label>
        <input
          id="file"
          name="file"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
          aria-describedby={state.error ? 'upload-error' : 'upload-hint'}
          aria-invalid={state.error ? true : undefined}
          className="border-border-strong bg-surface focus:ring-focus rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
        />
        <p id="upload-hint" className="text-text-muted text-sm">
          Nothing is published yet — the next screen shows what the file contains so you can check
          it first.
        </p>
      </div>

      {state.error ? (
        <p id="upload-error" role="alert" className="text-sm text-red-700 dark:text-red-400">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="bg-brand text-on-brand focus:ring-focus rounded-md px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:opacity-60"
      >
        {pending ? 'Reading file…' : 'Upload and preview'}
      </button>
    </form>
  );
}
