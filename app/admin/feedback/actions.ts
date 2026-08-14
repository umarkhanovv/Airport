'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { assertSameOrigin, requireAdmin } from '@/lib/admin/auth';
import {
  deleteFeedback,
  deleteReadFeedback,
  getFeedback,
  setFeedbackRead,
} from '@/lib/feedback/store';

/** Marks one submission read or unread. */
export async function toggleFeedbackRead(formData: FormData): Promise<void> {
  await requireAdmin('/admin/feedback');
  await assertSameOrigin();

  const id = formData.get('id');
  const read = formData.get('read');
  if (typeof id !== 'string' || id === '') return;

  setFeedbackRead(id, read === 'true');
  revalidatePath('/admin/feedback');
}

/**
 * Deletes one submission, once the sender's name has been typed back.
 *
 * The check happens here rather than in the browser, because this is the
 * request that destroys the row and the browser is not the thing to trust with
 * that. A `confirm()` dialog would also take the panel's no-JavaScript promise
 * away from the one screen where the cost of a mis-click is highest.
 *
 * A mismatch is not an error page: it comes back to the inbox with the row
 * marked and an explicit statement that nothing was deleted.
 */
export async function deleteFeedbackAction(formData: FormData): Promise<void> {
  await requireAdmin('/admin/feedback');
  await assertSameOrigin();

  const id = formData.get('id');
  if (typeof id !== 'string' || id === '') return;

  const submission = getFeedback(id);
  const typed = formData.get('confirmName');

  if (!submission || typeof typed !== 'string' || typed.trim() !== submission.name) {
    redirect(`/admin/feedback?confirm=mismatch&id=${encodeURIComponent(id)}`);
  }

  deleteFeedback(id);
  revalidatePath('/admin/feedback');

  redirect('/admin/feedback?deleted=1');
}

/**
 * Empties the read half of the inbox.
 *
 * No typed confirmation, and the count is in the button's own label instead —
 * "Delete 12 read messages". Reading the control is the confirmation, which is
 * more than a second dialog achieves, and every message it removes is one a
 * staff member has already opened and marked read.
 */
export async function deleteReadFeedbackAction(): Promise<void> {
  await requireAdmin('/admin/feedback');
  await assertSameOrigin();

  const removed = deleteReadFeedback();
  revalidatePath('/admin/feedback');

  redirect(`/admin/feedback?deleted=${removed}`);
}
