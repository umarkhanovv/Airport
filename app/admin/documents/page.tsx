import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { requireAdmin } from '@/lib/admin/auth';
import { readAdminLocale } from '@/lib/admin/locale';
import { SECTIONS } from '@/lib/constants';
import { airportToday } from '@/lib/date';
import { env } from '@/lib/env';
import { listPagesInSection } from '@/lib/content';
import { listAllDocuments } from '@/lib/documents/queries';
import { countUnreadFeedback } from '@/lib/feedback/store';

import { AdminNav } from '../admin-nav';

import { deleteDocumentAction, renameDocument, toggleDocumentPublished } from './actions';
import { UploadForm } from './upload-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await readAdminLocale(), namespace: 'Admin.meta' });
  return { title: t('documents') };
}

export const dynamic = 'force-dynamic';

/**
 * The document library (spec §5).
 *
 * These were going to be committed to the repository as part of the content
 * migration. The client stopped that, correctly: procurement notices are added
 * and superseded weekly, and material that changes weekly does not belong in a
 * deploy. So they live in the database, are uploaded here, and appear under
 * whichever content page they are filed against.
 *
 * Titles are rendered as text throughout — they come from filenames a person
 * chose, and the announcements page's legacy filenames contain everything from
 * quotes to angle brackets.
 */
export default async function AdminDocumentsPage({ searchParams }: PageProps<'/admin/documents'>) {
  await requireAdmin('/admin/documents');

  const { saved, deleted } = await searchParams;
  const t = await getTranslations({
    locale: await readAdminLocale(),
    namespace: 'Admin.documents',
  });

  const documents = listAllDocuments();

  // Every content page, in Russian — the paths are the same in all three, and
  // a document is filed against the page rather than against a translation.
  const pages = SECTIONS.flatMap((section) =>
    listPagesInSection('ru', section).map((page) => ({
      path: page.slug.join('/'),
      title: page.frontmatter.title,
    }))
  ).sort((a, b) => a.path.localeCompare(b.path));

  const byPage = new Map<string, typeof documents>();
  for (const document of documents) {
    byPage.set(document.pagePath, [...(byPage.get(document.pagePath) ?? []), document]);
  }

  const titleOf = (path: string) => pages.find((page) => page.path === path)?.title ?? path;
  const size = (bytes: number) =>
    bytes >= 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`;

  return (
    <>
      <AdminNav current="documents" unreadFeedback={countUnreadFeedback()} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-text-muted mt-2 text-sm">{t('intro')}</p>

        {saved ? (
          <p
            role="status"
            className="border-arrival bg-arrival-soft mt-4 rounded-md border px-4 py-3 text-sm"
          >
            {t('saved')}
          </p>
        ) : null}
        {deleted ? (
          <p role="status" className="panel mt-4 px-4 py-3 text-sm">
            {t('deleted')}
          </p>
        ) : null}

        <section className="panel mt-6 p-5">
          <h2 className="font-medium">{t('uploadHeading')}</h2>
          <UploadForm pages={pages} today={airportToday(env.airportTz)} />
        </section>

        <h2 className="mt-10 text-lg font-medium">
          {t('countHeading', { count: documents.length })}
        </h2>

        {documents.length === 0 ? (
          <p className="border-border text-text-muted mt-3 rounded-lg border border-dashed p-6 text-sm">
            {t('emptyHint')}
          </p>
        ) : (
          [...byPage.entries()].map(([pagePath, rows]) => (
            <section key={pagePath} className="mt-8">
              <h3 className="text-text font-medium">
                {titleOf(pagePath)}{' '}
                <span className="text-text-muted font-normal">
                  · /{pagePath} · {rows.length}
                </span>
              </h3>

              <ul className="panel divide-border mt-3 divide-y">
                {rows.map((document) => (
                  <li
                    key={document.id}
                    data-testid="document-row"
                    data-published={document.isPublished ? 'true' : 'false'}
                    className="flex flex-wrap items-center gap-3 px-4 py-3"
                  >
                    <form action={renameDocument} className="flex flex-1 items-center gap-2">
                      <input type="hidden" name="id" value={document.id} />
                      <label className="sr-only" htmlFor={`title-${document.id}`}>
                        {t('titleOf', { filename: document.originalFilename })}
                      </label>
                      <input
                        id={`title-${document.id}`}
                        name="title"
                        defaultValue={document.title}
                        className="border-border-strong bg-surface focus:ring-focus min-w-0 flex-1 rounded-md border px-2 py-1 text-sm focus:ring-2 focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="border-border-strong focus:ring-focus rounded-md border px-3 py-1 text-xs focus:ring-2 focus:outline-none"
                      >
                        {t('rename')}
                      </button>
                    </form>

                    <span className="text-text-muted tabular text-xs">
                      {size(document.sizeBytes)} · {document.publishedAt.slice(0, 10)}
                    </span>

                    <a
                      href={`/api/documents/${document.storedName}`}
                      className="text-brand-text-strong text-xs underline"
                    >
                      {t('download')}
                    </a>

                    <form action={toggleDocumentPublished}>
                      <input type="hidden" name="id" value={document.id} />
                      <input
                        type="hidden"
                        name="publish"
                        value={document.isPublished ? 'false' : 'true'}
                      />
                      <button
                        type="submit"
                        className="border-border-strong focus:ring-focus rounded-md border px-3 py-1 text-xs focus:ring-2 focus:outline-none"
                      >
                        {document.isPublished ? t('unpublish') : t('publish')}
                      </button>
                    </form>

                    <form action={deleteDocumentAction}>
                      <input type="hidden" name="id" value={document.id} />
                      <button
                        type="submit"
                        className="focus:ring-focus rounded-md border border-red-700 px-3 py-1 text-xs text-red-700 focus:ring-2 focus:outline-none dark:border-red-400 dark:text-red-400"
                      >
                        {t('delete')}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </main>
    </>
  );
}
