import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { requireAdmin } from '@/lib/admin/auth';
import { readAdminLocale } from '@/lib/admin/locale';
import { readStagedUpload, UploadRejectedError } from '@/lib/admin/uploads';
import { parseScheduleWorkbook } from '@/lib/flights';
import type { Diagnostic } from '@/lib/flights/types';

import { AdminNav } from '../../admin-nav';

import { PublishForm } from './publish-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await readAdminLocale(), namespace: 'Admin.meta' });
  return { title: t('previewSchedule') };
}

export const dynamic = 'force-dynamic';

/**
 * The diagnostic text itself stays in English.
 *
 * These come out of the parser, one per defect, and they name spreadsheet rows
 * and column headers — «row 42: MON has no date» is addressed to whoever opens
 * the workbook in Excel, and the workbook is in the airport's own mixed
 * Russian and English. Translating the frame around them (the headings, the
 * counts, the word "row") is what makes the screen readable; translating a
 * hundred parser messages would be a separate and much larger job, and is
 * recorded as one rather than half-done here.
 */
async function DiagnosticList({ items, tone }: { items: Diagnostic[]; tone: 'error' | 'warning' }) {
  if (items.length === 0) return null;

  // Its own lookup rather than a `t` passed down as a prop. The prop version
  // worked, but `tests/unit/i18n-usage.test.ts` resolves a key to the nearest
  // preceding `const t = …` in the file — which here is `generateMetadata`'s —
  // and reported half this screen as missing from `Admin.meta`. A component
  // that asks for its own namespace cannot be misattributed.
  const t = await getTranslations({ locale: await readAdminLocale(), namespace: 'Admin.schedule' });

  const isError = tone === 'error';

  return (
    <section className="mt-6" data-testid={isError ? 'preview-errors' : 'preview-warnings'}>
      <h2 className="text-lg font-medium">
        {isError
          ? t('errorsHeading', { count: items.length })
          : t('warningsHeading', { count: items.length })}
      </h2>
      <p className="text-text-muted mt-1 text-sm">
        {isError ? t('errorsIntro') : t('warningsIntro')}
      </p>

      <ul
        className={`mt-3 divide-y rounded-lg border ${
          isError
            ? 'divide-red-200 border-red-300 dark:divide-red-900 dark:border-red-900'
            : 'border-border divide-border'
        }`}
      >
        {items.map((d, i) => (
          <li
            key={`${d.code}-${d.row ?? 'file'}-${i}`}
            data-diagnostic={d.code}
            className="px-4 py-2.5 text-sm"
          >
            {/* Citing the real spreadsheet row is the point — staff fix the
                file in Excel, where rows are the only address they have. */}
            <span className="text-text-muted font-mono text-xs">
              {d.row
                ? t('locationRow', { row: d.row })
                : d.block
                  ? t('locationBlock', { block: d.block })
                  : t('locationFile')}
            </span>
            <span className="ms-2">{d.message}</span>
            <span className="text-text-muted ms-2 font-mono text-xs">{d.code}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function PreviewSchedulePage({ params }: PageProps<'/admin/schedule/[id]'>) {
  await requireAdmin('/admin/schedule');

  const { id } = await params;

  let staged: ReturnType<typeof readStagedUpload>;
  try {
    staged = readStagedUpload(id);
  } catch (error) {
    // A malformed id is indistinguishable from a missing one, by design.
    if (error instanceof UploadRejectedError) notFound();
    throw error;
  }
  if (!staged) notFound();

  const t = await getTranslations({ locale: await readAdminLocale(), namespace: 'Admin.schedule' });

  const parsed = parseScheduleWorkbook(staged.buffer);
  const errors = parsed.diagnostics.filter((d) => d.severity === 'error');
  const warnings = parsed.diagnostics.filter((d) => d.severity === 'warning');

  return (
    <>
      <AdminNav current="schedule" back={`/admin/schedule/${staged.record.id}`} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-semibold">{t('previewTitle')}</h1>
        <p className="text-text-muted mt-2 text-sm">{t('previewIntro')}</p>

        <dl className="panel mt-6 grid grid-cols-2 gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-4">
          <div className="col-span-2">
            <dt className="text-text-muted">{t('previewFile')}</dt>
            <dd className="mt-0.5 font-medium break-all">{staged.record.originalFilename}</dd>
          </div>
          <div>
            <dt className="text-text-muted">{t('previewSheet')}</dt>
            <dd className="mt-0.5 font-medium">{parsed.sheetName ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-text-muted">{t('previewSize')}</dt>
            <dd className="mt-0.5 font-medium">{(staged.record.sizeBytes / 1024).toFixed(0)} KB</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-text-muted">{t('previewWeek')}</dt>
            <dd className="mt-0.5 font-medium">
              {parsed.weekStart ?? '—'} … {parsed.weekEnd ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">{t('previewDays')}</dt>
            <dd data-testid="preview-days" className="mt-0.5 font-medium">
              {parsed.days.length}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">{t('previewFlights')}</dt>
            <dd data-testid="preview-flights" className="mt-0.5 font-medium">
              {parsed.entries.length}
            </dd>
          </div>
        </dl>

        {parsed.days.length > 0 ? (
          <section className="mt-6">
            <h2 className="text-lg font-medium">{t('daysHeading')}</h2>
            <div className="panel mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-sunken text-text-muted text-left">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-medium">
                      {t('columnDate')}
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      {t('columnWeekday')}
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      {t('columnArrivals')}
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      {t('columnDepartures')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-surface">
                  {parsed.days.map((day) => (
                    <tr key={day.date} className="border-border border-t">
                      <td className="px-4 py-2 whitespace-nowrap">{day.date}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{day.weekday ?? '—'}</td>
                      <td className="px-4 py-2">{day.arrivals}</td>
                      <td className="px-4 py-2">{day.departures}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <DiagnosticList items={errors} tone="error" />
        <DiagnosticList items={warnings} tone="warning" />

        {!parsed.ok ? (
          <p role="alert" className="mt-8 text-sm text-red-700 dark:text-red-400">
            {t('blocked')}
          </p>
        ) : null}

        <PublishForm stagedId={staged.record.id} blocked={!parsed.ok} />
      </main>
    </>
  );
}
