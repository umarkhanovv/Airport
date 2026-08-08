import { getTranslations } from 'next-intl/server';

import { listDocumentsForPage } from '@/lib/documents/queries';
import { extensionOf } from '@/lib/documents/types';

/**
 * The documents published on one content page.
 *
 * Rendered under the page's own text, so a page can be prose, a list of files,
 * or both. The announcements page is almost entirely this: 188 procurement
 * notices whose only content is the file and what it is called.
 *
 * The format and size are shown next to every link. A visitor on a phone with a
 * metered connection deserves to know that the thing they are about to tap is a
 * 6 MB scan before they tap it.
 */
export async function DocumentList({ locale, pagePath }: { locale: string; pagePath: string }) {
  const documents = listDocumentsForPage(pagePath);
  if (documents.length === 0) return null;

  const t = await getTranslations({ locale, namespace: 'Documents' });

  const size = (bytes: number) =>
    bytes >= 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`;

  return (
    <section className="mt-10" aria-labelledby="documents-heading">
      <h2 id="documents-heading" className="text-text text-lg font-semibold">
        {t('title')}
      </h2>

      <ul className="glass divide-border mt-3 divide-y rounded-xl">
        {documents.map((document) => (
          <li key={document.id}>
            <a
              href={`/api/documents/${document.storedName}`}
              className="hover:bg-surface-sunken focus-visible:ring-focus flex flex-wrap items-baseline gap-x-3 px-4 py-3 focus-visible:ring-2 focus-visible:outline-none"
              // Leaves the page as a download rather than navigating.
              download={document.originalFilename}
            >
              <span className="text-brand-text-strong font-medium underline underline-offset-2">
                {document.title}
              </span>
              <span className="text-text-muted tabular text-xs uppercase">
                {extensionOf(document.originalFilename).replace('.', '')} ·{' '}
                {size(document.sizeBytes)}
              </span>
              <time
                dateTime={document.publishedAt.slice(0, 10)}
                className="text-text-muted tabular ms-auto text-xs"
              >
                {document.publishedAt.slice(0, 10)}
              </time>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
