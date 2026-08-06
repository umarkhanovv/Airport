import type { Metadata } from 'next';

import { requireAdmin } from '@/lib/admin/auth';
import { getActiveSchedule } from '@/lib/flights/queries';

import { AdminNav } from '../admin-nav';

import { UploadForm } from './upload-form';

export const metadata: Metadata = { title: 'Upload schedule' };

export const dynamic = 'force-dynamic';

export default async function UploadSchedulePage() {
  await requireAdmin('/admin/schedule');

  const active = getActiveSchedule();

  return (
    <>
      <AdminNav current="schedule" />

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-semibold">Upload schedule</h1>

        {active ? (
          <p className="text-text-muted mt-2 text-sm">
            The board is currently showing {active.entryCount} flights for {active.weekStart ?? '—'}{' '}
            … {active.weekEnd ?? '—'}. It keeps showing them until you confirm a replacement.
          </p>
        ) : (
          <p className="text-text-muted mt-2 text-sm">
            No schedule is published yet. This will be the first.
          </p>
        )}

        <UploadForm />
      </main>
    </>
  );
}
