'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { assertSameOrigin, requireAdmin } from '@/lib/admin/auth';
import {
  discardStagedUpload,
  MAX_SCHEDULE_BYTES,
  promoteStagedUpload,
  readStagedUpload,
  stageUpload,
  UploadRejectedError,
} from '@/lib/admin/uploads';
import { getDb } from '@/lib/db';
import { parseScheduleWorkbook } from '@/lib/flights';
import { ImportRefusedError, publishSchedule } from '@/lib/flights/import';

export interface UploadState {
  error?: string;
}

export interface PublishState {
  error?: string;
}

/**
 * Refreshes the public pages that read the schedule.
 *
 * The board and the home page are both time-revalidated, which is right for
 * normal traffic and wrong for a publish — staff who just uploaded next week's
 * schedule should not be told to wait for a cache window.
 */
function revalidatePublicBoard(): void {
  revalidatePath('/[locale]/flights', 'page');
  revalidatePath('/[locale]', 'page');
}

/** Step 1: validate and stage the workbook, then show the preview. */
export async function uploadSchedule(
  _state: UploadState,
  formData: FormData
): Promise<UploadState> {
  await requireAdmin();
  await assertSameOrigin();

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose an .xlsx file to upload.' };
  }

  // Checked before reading the stream so an oversized file is refused without
  // buffering it into memory first.
  if (file.size > MAX_SCHEDULE_BYTES) {
    return { error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB.` };
  }

  let stagedId: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    stagedId = stageUpload(buffer, file.name).id;
  } catch (error) {
    if (error instanceof UploadRejectedError) return { error: error.message };
    throw error;
  }

  redirect(`/admin/schedule/${stagedId}`);
}

/**
 * Step 2: publish a staged workbook.
 *
 * The file is re-read and re-parsed here rather than carrying a parse result
 * across the two requests. The parser is deterministic, so the preview the
 * staff member approved is the result being published — and nothing large or
 * trusted has to survive in a cookie or in process memory in between.
 */
export async function publishStagedSchedule(
  _state: PublishState,
  formData: FormData
): Promise<PublishState> {
  await requireAdmin();
  await assertSameOrigin();

  const id = formData.get('id');
  if (typeof id !== 'string') {
    return { error: 'Unknown upload.' };
  }

  let staged: ReturnType<typeof readStagedUpload>;
  try {
    staged = readStagedUpload(id);
  } catch (error) {
    if (error instanceof UploadRejectedError) return { error: error.message };
    throw error;
  }

  if (!staged) {
    return { error: 'That upload is no longer available. Upload the file again.' };
  }

  const parsed = parseScheduleWorkbook(staged.buffer);
  if (!parsed.ok) {
    return { error: 'This file has errors and cannot be published. Fix them and upload again.' };
  }

  // The workbook is copied into permanent storage before the transaction, the
  // same order the CLI importer uses: a row must never point at a missing file.
  const storedPath = promoteStagedUpload(id);

  try {
    publishSchedule(getDb(), parsed, {
      originalFilename: staged.record.originalFilename,
      storedPath,
      sha256: staged.record.sha256,
    });
  } catch (error) {
    if (error instanceof ImportRefusedError) {
      return { error: 'This file failed validation and was not published.' };
    }
    throw error;
  }

  discardStagedUpload(id);
  revalidatePublicBoard();

  redirect('/admin?published=1');
}

/** Abandons a staged upload without publishing it. */
export async function discardSchedule(formData: FormData): Promise<void> {
  await requireAdmin();
  await assertSameOrigin();

  const id = formData.get('id');
  if (typeof id === 'string') {
    try {
      discardStagedUpload(id);
    } catch (error) {
      if (!(error instanceof UploadRejectedError)) throw error;
    }
  }

  redirect('/admin/schedule');
}
