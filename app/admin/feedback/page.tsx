import type { Metadata } from 'next';

import { requireAdmin } from '@/lib/admin/auth';
import { formatAirportDateTime } from '@/lib/date';
import { env } from '@/lib/env';
import { countReadFeedback, countUnreadFeedback, listFeedback } from '@/lib/feedback/store';

import { AdminNav } from '../admin-nav';

import { deleteReadFeedbackAction, toggleFeedbackRead } from './actions';
import { FeedbackDeleteForm } from './delete-form';

export const metadata: Metadata = { title: 'Feedback' };

export const dynamic = 'force-dynamic';

/** Airport time, not the server's. See `formatAirportDateTime`. */
const formatTimestamp = (iso: string) => formatAirportDateTime(iso, env.airportTz);

/**
 * The feedback inbox (spec §8, §9).
 *
 * Every value here was typed by an anonymous member of the public, so this page
 * is the target for a stored XSS — submit a script through the public form,
 * wait for staff to open the panel (plan §9.1). Nothing below uses
 * `dangerouslySetInnerHTML`; JSX escapes every interpolation, and the message
 * body is rendered as text with `whitespace-pre-wrap` so newlines survive
 * without any markup being interpreted.
 */
export default async function AdminFeedbackPage({ searchParams }: PageProps<'/admin/feedback'>) {
  await requireAdmin('/admin/feedback');

  const { deleted, confirm, id: mismatchId } = await searchParams;

  const submissions = listFeedback();
  const unread = countUnreadFeedback();
  const read = countReadFeedback();
  const removed = Number(Array.isArray(deleted) ? deleted[0] : deleted);

  return (
    <>
      <AdminNav current="feedback" unreadFeedback={unread} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-semibold">Feedback</h1>
        <p className="text-text-muted mt-2 text-sm">
          {submissions.length === 0
            ? 'Nothing has been submitted yet.'
            : `${submissions.length} message${submissions.length === 1 ? '' : 's'}, ${unread} unread.`}
        </p>

        {/* The count, not the click: "deleted" is obvious from the row being
            gone, and how many went is not. */}
        {Number.isFinite(removed) && removed > 0 ? (
          <p
            role="status"
            className="border-arrival bg-arrival-soft mt-4 rounded-md border px-4 py-3 text-sm"
          >
            {removed === 1 ? 'Message deleted.' : `${removed} read messages deleted.`}
          </p>
        ) : null}

        {/*
          Only offered when there is something to clear, and it says how many
          it will take. Reading the button is the confirmation — better than a
          dialog, which is dismissed without being read.
        */}
        {read > 0 ? (
          <form action={deleteReadFeedbackAction} className="mt-4">
            <button
              type="submit"
              className="border-border-strong text-text hover:bg-surface-sunken focus:ring-focus rounded-md border px-3 py-1.5 text-sm focus:ring-2 focus:outline-none"
            >
              Delete {read} read message{read === 1 ? '' : 's'}
            </button>
          </form>
        ) : null}

        {submissions.length === 0 ? (
          <p className="border-border text-text-muted mt-6 rounded-lg border border-dashed p-6 text-sm">
            Messages sent through the contacts page appear here. This works with no email
            configuration at all — SMTP, when set, only adds a copy by mail.
          </p>
        ) : (
          <ul className="mt-6 flex flex-col gap-4">
            {submissions.map((item) => (
              <li
                key={item.id}
                data-testid="feedback-item"
                data-read={item.isRead ? 'true' : 'false'}
                className={`panel p-4 ${item.isRead ? '' : 'border-brand'}`}
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-medium">{item.name}</span>
                  {item.isRead ? null : (
                    <span className="bg-brand text-on-brand rounded px-1.5 py-0.5 text-xs font-medium">
                      new
                    </span>
                  )}
                  <span className="text-text-muted ms-auto text-xs">
                    {formatTimestamp(item.createdAt)} · {item.locale}
                  </span>
                </div>

                {item.subject ? <p className="mt-1 font-medium">{item.subject}</p> : null}

                <p className="text-text mt-3 text-sm whitespace-pre-wrap">{item.message}</p>

                <dl className="text-text-muted mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  {item.email ? (
                    <div className="flex gap-1.5">
                      <dt>Email:</dt>
                      {/*
                        mailto is built from an address that has passed
                        validation, so it cannot carry a scheme of its own.
                      */}
                      <dd>
                        <a className="underline" href={`mailto:${item.email}`}>
                          {item.email}
                        </a>
                      </dd>
                    </div>
                  ) : null}
                  {item.phone ? (
                    <div className="flex gap-1.5">
                      <dt>Phone:</dt>
                      <dd>{item.phone}</dd>
                    </div>
                  ) : null}
                </dl>

                <div className="mt-4 flex flex-wrap items-start gap-3">
                  <form action={toggleFeedbackRead}>
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="read" value={item.isRead ? 'false' : 'true'} />
                    <button
                      type="submit"
                      className="border-border-strong focus:ring-focus rounded-md border px-3 py-1.5 text-sm focus:ring-2 focus:outline-none"
                    >
                      {item.isRead ? 'Mark unread' : 'Mark read'}
                    </button>
                  </form>

                  <FeedbackDeleteForm
                    id={item.id}
                    name={item.name}
                    mismatch={confirm === 'mismatch' && mismatchId === item.id}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
