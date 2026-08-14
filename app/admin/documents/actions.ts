'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { assertSameOrigin, requireAdmin } from '@/lib/admin/auth';
import { airportToday } from '@/lib/date';
import {
  createDocument,
  deleteDocument,
  getDocumentById,
  updateDocument,
} from '@/lib/documents/queries';
import { storeDocument } from '@/lib/documents/storage';
import { env } from '@/lib/env';
import {
  DocumentRejectedError,
  MAX_DOCUMENT_BYTES,
  displayFilename,
  titleFromFilename,
} from '@/lib/documents/types';

/** One refusal, named rather than worded — see `DocumentRejectedError`. */
export interface DocumentRejectionReport {
  key: string;
  params: Record<string, string | number>;
}

export interface DocumentsState {
  errorKey?: string;
  /** Files that were refused, so a batch upload reports each one. */
  rejected?: DocumentRejectionReport[];
  uploaded?: number;
}

/**
 * Locale *identifiers*, not URL prefixes.
 *
 * Kazakh is served under `/kz` but its identifier is `kk` (see `i18n/routing`),
 * and the rewrite from one to the other happens in middleware — so the route
 * Next has cached, and the one to invalidate, is `/kk/…`.
 */
const LOCALES = ['ru', 'en', 'kk'];

/**
 * Regenerates the pages one document appears on.
 *
 * Content pages are statically generated, so a document added today would not
 * appear until the next deploy without this — and unpublishing one would not
 * come off the page at all, which is the direction that matters: a procurement
 * notice that has been pulled has usually been pulled for a reason.
 *
 * The concrete localised paths, rather than the route pattern or the whole
 * tree. `revalidatePath('/[locale]/[...slug]', 'page')` did not take a
 * withdrawn document off its page, and `revalidatePath('/', 'layout')` did but
 * invalidated the news pages at the same time — which is invisible in
 * production and made the end-to-end suite fail about one run in three, as the
 * news tests paginated through pages another test had just thrown away.
 */
function revalidateDocumentPages(...pagePaths: Array<string | null | undefined>): void {
  for (const pagePath of new Set(pagePaths.filter(Boolean))) {
    for (const locale of LOCALES) revalidatePath(`/${locale}/${pagePath}`);
  }
}

/**
 * Uploads one or more files onto a page.
 *
 * Many at once by design: the announcements page carries 188 documents and the
 * airport adds them in batches, so a form that took one at a time would be used
 * once and then worked around.
 *
 * A file that is refused does not stop the others. Staff selecting thirty files
 * should be told which two were wrong, not have the batch fail.
 */
export async function uploadDocuments(
  _state: DocumentsState,
  formData: FormData
): Promise<DocumentsState> {
  await requireAdmin();
  await assertSameOrigin();

  const pagePath = formData.get('pagePath');
  if (typeof pagePath !== 'string' || pagePath === '') {
    return { errorKey: 'errorChoosePage' };
  }

  const publishedAt = formData.get('publishedAt');
  const date =
    typeof publishedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(publishedAt)
      ? publishedAt
      : // The airport's date, not the server's: a UTC host is still on yesterday
        // for the first five hours of every Türkistan day.
        airportToday(env.airportTz);

  const files = formData.getAll('files').filter((file): file is File => file instanceof File);
  if (files.length === 0 || files.every((file) => file.size === 0)) {
    return { errorKey: 'errorChooseFile' };
  }

  const rejected: DocumentRejectionReport[] = [];
  let uploaded = 0;

  for (const file of files) {
    if (file.size === 0) continue;

    // Checked before the stream is read, so an oversized file is refused
    // without being buffered into memory first.
    if (file.size > MAX_DOCUMENT_BYTES) {
      rejected.push({
        key: 'errorTooLarge',
        params: { filename: file.name, size: (file.size / 1024 / 1024).toFixed(1) },
      });
      continue;
    }

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const storedName = storeDocument(buffer, file.name);

      createDocument({
        pagePath,
        title: titleFromFilename(file.name),
        storedName,
        originalFilename: displayFilename(file.name),
        sizeBytes: buffer.length,
        publishedAt: `${date}T00:00:00.000Z`,
      });
      uploaded += 1;
    } catch (error) {
      if (error instanceof DocumentRejectedError) {
        rejected.push({ key: error.code, params: error.params });
        continue;
      }
      throw error;
    }
  }

  revalidateDocumentPages(pagePath);

  // Titles default to the filename and are edited in the list below, so the
  // upload lands the staff member back where they can fix them.
  return { uploaded, rejected: rejected.length > 0 ? rejected : undefined };
}

export async function renameDocument(formData: FormData): Promise<void> {
  await requireAdmin();
  await assertSameOrigin();

  const id = formData.get('id');
  const title = formData.get('title');
  const pagePath = formData.get('pagePath');
  if (typeof id !== 'string') return;

  const existing = getDocumentById(id);
  if (!existing) return;

  updateDocument(id, {
    ...(typeof title === 'string' && title.trim() !== ''
      ? { title: title.trim().slice(0, 200) }
      : {}),
    ...(typeof pagePath === 'string' && pagePath !== '' ? { pagePath } : {}),
  });

  // Both, when a document is moved: the page it left has to lose it.
  revalidateDocumentPages(existing.pagePath, typeof pagePath === 'string' ? pagePath : null);
  redirect('/admin/documents?saved=1');
}

export async function toggleDocumentPublished(formData: FormData): Promise<void> {
  await requireAdmin();
  await assertSameOrigin();

  const id = formData.get('id');
  if (typeof id !== 'string') return;

  const existing = getDocumentById(id);
  if (!existing) return;

  updateDocument(id, { isPublished: formData.get('publish') === 'true' });

  revalidateDocumentPages(existing.pagePath);
  redirect('/admin/documents');
}

export async function deleteDocumentAction(formData: FormData): Promise<void> {
  await requireAdmin();
  await assertSameOrigin();

  const id = formData.get('id');
  if (typeof id !== 'string') return;

  // Read before the row goes; afterwards there is nothing to say which page
  // needs regenerating.
  const existing = getDocumentById(id);
  deleteDocument(id);

  revalidateDocumentPages(existing?.pagePath);
  redirect('/admin/documents?deleted=1');
}
