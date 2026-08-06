import type { Metadata } from 'next';
import Link from 'next/link';

import { requireAdmin } from '@/lib/admin/auth';
import { listScheduleUploads } from '@/lib/admin/queries';
import { countUnreadFeedback } from '@/lib/feedback/store';
import { getActiveSchedule } from '@/lib/flights/queries';

import { AdminNav } from './admin-nav';

export const metadata: Metadata = { title: 'Overview' };

/** Reads the session cookie and live database state. Never prerendered. */
export const dynamic = 'force-dynamic';

function formatTimestamp(iso: string): string {
  const parsed = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

export default async function AdminDashboardPage({ searchParams }: PageProps<'/admin'>) {
  await requireAdmin('/admin');

  const { published } = await searchParams;
  const active = getActiveSchedule();
  const history = listScheduleUploads();

  return (
    <>
      <AdminNav current="dashboard" unreadFeedback={countUnreadFeedback()} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-semibold">Overview</h1>

        {published ? (
          <p
            role="status"
            className="border-arrival bg-arrival-soft mt-4 rounded-md border px-4 py-3 text-sm"
          >
            Schedule published. The public board is showing it now.
          </p>
        ) : null}

        <section className="mt-8">
          <h2 className="text-lg font-medium">Live schedule</h2>

          {active ? (
            <dl className="border-border bg-surface mt-3 grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border p-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-text-muted">Week</dt>
                <dd className="mt-0.5 font-medium">
                  {active.weekStart ?? '—'} … {active.weekEnd ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-text-muted">Flights</dt>
                <dd data-testid="live-flights" className="mt-0.5 font-medium">
                  {active.entryCount}
                </dd>
              </div>
              <div>
                <dt className="text-text-muted">Published</dt>
                <dd className="mt-0.5 font-medium">{formatTimestamp(active.uploadedAt)}</dd>
              </div>
              <div>
                <dt className="text-text-muted">File</dt>
                <dd className="mt-0.5 font-medium break-all">{active.originalFilename}</dd>
              </div>
            </dl>
          ) : (
            <p className="border-border text-text-muted mt-3 rounded-lg border border-dashed p-6 text-sm">
              No schedule has been published yet. The public board is showing its empty state.
            </p>
          )}

          <Link
            href="/admin/schedule"
            className="bg-brand text-on-brand focus:ring-focus mt-4 inline-block rounded-md px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-offset-2 focus:outline-none"
          >
            Upload a new schedule
          </Link>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-medium">Upload history</h2>
          <p className="text-text-muted mt-1 text-sm">
            Previous schedules are kept, not deleted — the original workbooks stay downloadable.
          </p>

          {history.length === 0 ? (
            <p className="text-text-muted mt-3 text-sm">Nothing published yet.</p>
          ) : (
            <div className="border-border mt-3 overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="bg-surface-sunken text-text-muted text-left">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Uploaded
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Week
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Flights
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Warnings
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      File
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-surface">
                  {history.map((row) => (
                    <tr key={row.id} className="border-border border-t">
                      <td className="px-4 py-2 whitespace-nowrap">
                        {formatTimestamp(row.uploadedAt)}
                        {row.isActive ? (
                          <span className="bg-arrival-soft text-arrival ms-2 rounded px-1.5 py-0.5 text-xs font-medium">
                            live
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {row.weekStart ?? '—'} … {row.weekEnd ?? '—'}
                      </td>
                      <td className="px-4 py-2">{row.entryCount}</td>
                      <td className="px-4 py-2">{row.warnings.length}</td>
                      <td className="px-4 py-2 break-all">{row.originalFilename}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
