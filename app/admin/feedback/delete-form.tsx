import { deleteFeedbackAction } from './actions';

/**
 * Deleting one message, with the sender's name typed back.
 *
 * The same shape as deleting a post (`app/admin/news/[id]/delete-form.tsx`) or
 * a schedule, and the check is repeated on the server in `actions.ts` — this
 * is the convenience half. A bare "are you sure?" is dismissed without being
 * read; asking for something only somebody looking at the right message can
 * produce is the part that actually stops the wrong deletion.
 *
 * A plain server-action form with no client state, so it works with scripting
 * off like everything else in the panel.
 */
export function FeedbackDeleteForm({
  id,
  name,
  mismatch,
}: {
  id: string;
  name: string;
  mismatch: boolean;
}) {
  return (
    <form action={deleteFeedbackAction} className="flex flex-wrap items-start gap-2">
      <input type="hidden" name="id" value={id} />

      <div>
        <label htmlFor={`confirm-${id}`} className="sr-only">
          To delete this message, type the sender’s name: {name}
        </label>
        <input
          id={`confirm-${id}`}
          name="confirmName"
          type="text"
          required
          autoComplete="off"
          placeholder={name}
          aria-invalid={mismatch || undefined}
          aria-describedby={mismatch ? `confirm-error-${id}` : undefined}
          className="border-border-strong bg-surface focus:ring-focus w-40 rounded-md border px-3 py-1.5 text-sm focus:ring-2 focus:outline-none"
        />
      </div>

      <button
        type="submit"
        className="border-brand text-brand-text-strong hover:bg-surface-sunken focus:ring-focus rounded-md border px-3 py-1.5 text-sm font-medium focus:ring-2 focus:outline-none"
      >
        Delete
      </button>

      {mismatch ? (
        <p
          id={`confirm-error-${id}`}
          role="alert"
          className="text-brand-text-strong w-full text-sm"
        >
          That is not this sender’s name. Nothing was deleted.
        </p>
      ) : null}
    </form>
  );
}
