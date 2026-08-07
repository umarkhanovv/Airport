'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { assertSameOrigin, requireAdmin } from '@/lib/admin/auth';
import {
  createDocument,
  deleteDocument,
  getDocumentById,
  updateDocument,
} from '@/lib/documents/queries';
import { storeDocument } from '@/lib/documents/storage';
import {
  DocumentRejectedError,
  MAX_DOCUMENT_BYTES,
  displayFilename,
  titleFromFilename,
} from '@/lib/documents/types';

export interface DocumentsState {
  error?: string;
  /** Files that were refused, so a batch upload reports each one. */
  rejected?: string[];
  uploaded?: number;
}

/**
 * Content pages are statically generated, so a document added today would not
 * appear until the next deploy without this — and unpublishing one would not
 * take it off the page at all, which is the direction that matters.
 */
function revalidateContentPages(): void {
  // The whole tree, rather than the catch-all route the pages live under.
  // The narrower form left a withdrawn document on the page it had been
  // published to, and removal is the direction that matters: a procurement
  // notice that has been pulled has usually been pulled for a reason. Documents
  // change rarely enough that regenerating more than strictly necessary costs
  // nothing worth measuring.
  revalidatePath('/', 'layout');
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
    return { error: 'Choose the page these belong to.' };
  }

  const publishedAt = formData.get('publishedAt');
  const date =
    typeof publishedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(publishedAt)
      ? publishedAt
      : new Date().toISOString().slice(0, 10);

  const files = formData.getAll('files').filter((file): file is File => file instanceof File);
  if (files.length === 0 || files.every((file) => file.size === 0)) {
    return { error: 'Choose at least one file.' };
  }

  const rejected: string[] = [];
  let uploaded = 0;

  for (const file of files) {
    if (file.size === 0) continue;

    // Checked before the stream is read, so an oversized file is refused
    // without being buffered into memory first.
    if (file.size > MAX_DOCUMENT_BYTES) {
      rejected.push(`${file.name} — ${(file.size / 1024 / 1024).toFixed(1)} MB, over the limit`);
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
        rejected.push(error.message);
        continue;
      }
      throw error;
    }
  }

  revalidateContentPages();

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
  if (typeof id !== 'string' || !getDocumentById(id)) return;

  updateDocument(id, {
    ...(typeof title === 'string' && title.trim() !== ''
      ? { title: title.trim().slice(0, 200) }
      : {}),
    ...(typeof pagePath === 'string' && pagePath !== '' ? { pagePath } : {}),
  });

  revalidateContentPages();
  redirect('/admin/documents?saved=1');
}

export async function toggleDocumentPublished(formData: FormData): Promise<void> {
  await requireAdmin();
  await assertSameOrigin();

  const id = formData.get('id');
  if (typeof id !== 'string') return;

  updateDocument(id, { isPublished: formData.get('publish') === 'true' });

  revalidateContentPages();
  redirect('/admin/documents');
}

export async function deleteDocumentAction(formData: FormData): Promise<void> {
  await requireAdmin();
  await assertSameOrigin();

  const id = formData.get('id');
  if (typeof id !== 'string') return;

  deleteDocument(id);

  revalidateContentPages();
  redirect('/admin/documents?deleted=1');
}
