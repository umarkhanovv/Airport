import type { Metadata } from 'next';

import { requireAdmin } from '@/lib/admin/auth';
import { countUnreadFeedback, listFeedback } from '@/lib/feedback/store';

import { AdminNav } from '../admin-nav';

import { toggleFeedbackRead } from './actions';

export const metadata: Metadata = { title: 'Feedback' };

export const dynamic = 'force-dynamic';

function formatTimestamp(iso: string): string {
  const parsed = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return `${parsed.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

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
export default async function AdminFeedbackPage() {
  await requireAdmin('/admin/feedback');

  const submissions = listFeedback();
  const unread = countUnreadFeedback();

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

                <form action={toggleFeedbackRead} className="mt-4">
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="read" value={item.isRead ? 'false' : 'true'} />
                  <button
                    type="submit"
                    className="border-border-strong focus:ring-focus rounded-md border px-3 py-1.5 text-sm focus:ring-2 focus:outline-none"
                  >
                    {item.isRead ? 'Mark unread' : 'Mark read'}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
